import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Resolver } from 'dns/promises';
import { PrismaService } from '../../common/prisma.service';
import { RedisService } from '../../common/redis.service';

const CACHE_KEY = 'domains:active';
const CACHE_TTL = 300; // 5 min

// Consulta direto num resolvedor público confiável (Cloudflare/Google) em vez
// do resolvedor padrão do sistema — o resolvedor da própria VPS (provedor)
// pode manter cache negativo desatualizado por até a duração do SOA da zona,
// fazendo a verificação continuar "falhando" mesmo com o DNS do cliente já
// propagado e correto em todo o resto da internet.
function createPublicDnsResolver(): Resolver {
  const resolver = new Resolver();
  resolver.setServers(['1.1.1.1', '8.8.8.8']);
  return resolver;
}

@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ── Admin ────────────────────────────────────────────────────────────────────

  async findAll() {
    // Só domínios globais — os próprios de workspace vivem separados em
    // findAllOwn(), nunca aparecem misturados aqui.
    const domains = await (this.prisma as any).domain.findMany({
      where:   { workspaceId: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redirectors: true } } },
    });
    return domains.map((d: any) => ({
      id:               d.id,
      domain:           d.domain,
      isActive:         d.isActive,
      isDefault:        d.isDefault,
      hiddenFromPicker: d.hiddenFromPicker,
      dnsStatus:        d.dnsStatus,
      sslStatus:        d.sslStatus,
      verifiedAt:       d.verifiedAt,
      sslIssuedAt:      d.sslIssuedAt,
      createdAt:        d.createdAt,
      linksCount:       d._count.redirectors,
    }));
  }

  async create(domain: string) {
    const clean = this.sanitize(domain);
    this.validate(clean);

    const existing = await (this.prisma as any).domain.findUnique({ where: { domain: clean } });
    if (existing) throw new ConflictException('Domínio já cadastrado');

    const record = await (this.prisma as any).domain.create({
      data: {
        id:        this.newId(),
        domain:    clean,
        isActive:  false,
        isDefault: false,
        dnsStatus: 'pending',
        sslStatus: 'pending',
      },
    });
    return { ...record, linksCount: 0, serverIp: this.getServerIp() };
  }

  async update(id: string, domain: string) {
    const existing = await this.findOrFail(id);
    const clean    = this.sanitize(domain);
    this.validate(clean);

    // Domínio não mudou — nada a resetar
    if (clean === existing.domain) return existing;

    const conflict = await (this.prisma as any).domain.findFirst({
      where: { domain: clean, NOT: { id } },
    });
    if (conflict) throw new ConflictException('Domínio já cadastrado');

    // Domínio mudou → reseta DNS + SSL (novo cert necessário)
    const record = await (this.prisma as any).domain.update({
      where: { id },
      data:  {
        domain:      clean,
        isActive:    false,
        dnsStatus:   'pending',
        sslStatus:   'pending',
        verifiedAt:  null,
        sslIssuedAt: null,
      },
    });
    await this.invalidateCache();
    return record;
  }

  async remove(id: string) {
    const d = await this.findOrFail(id);
    if (d.isDefault) throw new BadRequestException('Não é possível excluir o domínio padrão');
    await (this.prisma as any).domain.delete({ where: { id } });
    // Tenta remover config nginx (best-effort via cert-manager)
    this.callCertManager('/remove', { domain: d.domain }).catch(() => {});
    await this.invalidateCache();
    return { ok: true };
  }

  async activate(id: string) {
    const d = await this.findOrFail(id);
    if (d.sslStatus !== 'active') {
      throw new BadRequestException('Apenas domínios com SSL verificado podem ser ativados');
    }
    const record = await (this.prisma as any).domain.update({ where: { id }, data: { isActive: true } });
    await this.invalidateCache();
    return record;
  }

  async deactivate(id: string) {
    const d = await this.findOrFail(id);
    if (d.isDefault) throw new BadRequestException('Não é possível desativar o domínio padrão');
    const record = await (this.prisma as any).domain.update({ where: { id }, data: { isActive: false } });
    await this.invalidateCache();
    return record;
  }

  // Oculta/exibe o domínio na lista de escolha em NOVOS redirecionadores — não
  // mexe em isActive/isDefault, nem afeta redirecionadores já criados (a
  // resolução de link não consulta esse campo). Diferente de deactivate(), pode
  // ser aplicado até no domínio padrão.
  async togglePicker(id: string) {
    const d = await this.findOrFail(id);
    const record = await (this.prisma as any).domain.update({
      where: { id },
      data:  { hiddenFromPicker: !d.hiddenFromPicker },
    });
    await this.invalidateCache();
    return record;
  }

  async setDefault(id: string) {
    const d = await this.findOrFail(id);
    if (d.dnsStatus !== 'active' || d.sslStatus !== 'active') {
      throw new BadRequestException('Apenas domínios com DNS e SSL verificados podem ser o padrão');
    }
    await (this.prisma as any).domain.updateMany({ data: { isDefault: false } });
    const record = await (this.prisma as any).domain.update({
      where: { id },
      data:  { isDefault: true, isActive: true },
    });
    await this.invalidateCache();
    return record;
  }

  // ── Workspace (domínio próprio de conta) ──────────────────────────────────────
  // Caminhos paralelos aos do admin acima — não alteram nem dependem deles.
  // Domínio próprio só pode ser gerenciado pelo workspace dono (checagem em
  // findOwnOrFail), e nunca aparece nas rotas/telas do admin.

  private static readonly MAX_DOMAINS_PER_WORKSPACE = 3;

  async findAllOwn(workspaceId: string) {
    const domains = await (this.prisma as any).domain.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { redirectors: true } } },
    });
    return domains.map((d: any) => ({
      id:          d.id,
      domain:      d.domain,
      isActive:    d.isActive,
      dnsStatus:   d.dnsStatus,
      sslStatus:   d.sslStatus,
      verifiedAt:  d.verifiedAt,
      sslIssuedAt: d.sslIssuedAt,
      createdAt:   d.createdAt,
      linksCount:  d._count.redirectors,
    }));
  }

  async createOwn(workspaceId: string, domain: string) {
    const clean = this.sanitize(domain);
    this.validate(clean);

    const count = await (this.prisma as any).domain.count({ where: { workspaceId } });
    if (count >= DomainsService.MAX_DOMAINS_PER_WORKSPACE) {
      throw new BadRequestException(`Limite de ${DomainsService.MAX_DOMAINS_PER_WORKSPACE} domínios por conta atingido`);
    }

    const existing = await (this.prisma as any).domain.findUnique({ where: { domain: clean } });
    if (existing) throw new ConflictException('Domínio já cadastrado');

    const record = await (this.prisma as any).domain.create({
      data: {
        id:          this.newId(),
        domain:      clean,
        workspaceId,
        isActive:    false,
        isDefault:   false,
        dnsStatus:   'pending',
        sslStatus:   'pending',
      },
    });
    return { ...record, linksCount: 0, serverIp: this.getServerIp() };
  }

  async verifyDnsOwn(workspaceId: string, id: string) {
    const d = await this.findOwnOrFail(workspaceId, id);
    return this.runVerification(d);
  }

  async removeOwn(workspaceId: string, id: string) {
    const d = await this.findOwnOrFail(workspaceId, id);
    await (this.prisma as any).domain.delete({ where: { id } });
    this.callCertManager('/remove', { domain: d.domain }).catch(() => {});
    await this.invalidateCache();
    return { ok: true };
  }

  private async findOwnOrFail(workspaceId: string, id: string) {
    const d = await (this.prisma as any).domain.findFirst({ where: { id, workspaceId } });
    if (!d) throw new NotFoundException('Domínio não encontrado');
    return d;
  }

  // ── DNS + SSL verification ────────────────────────────────────────────────────

  async verifyDns(id: string) {
    const d = await this.findOrFail(id);
    return this.runVerification(d);
  }

  // Corpo da verificação em si — reaproveitado tanto pelo admin (domínio
  // global) quanto pelos domínios próprios de workspace, sem duplicar a lógica.
  private async runVerification(d: any): Promise<{
    verified:   boolean;
    dnsStatus:  string;
    sslStatus:  string;
    addresses:  string[];
    expected:   string;
    error?:     string;
    sslError?:  string;
  }> {
    const id = d.id;
    const serverIp = this.getServerIp();

    if (!serverIp) {
      throw new BadRequestException('SERVER_IP não configurado no servidor — contate o suporte');
    }

    // ── 1. Verificação DNS ────────────────────────────────────────────────────
    let addresses: string[] = [];
    let dnsVerified = false;
    let dnsError: string | undefined;

    try {
      addresses    = await createPublicDnsResolver().resolve4(d.domain);
      dnsVerified  = addresses.includes(serverIp);
    } catch (e: any) {
      dnsError = (e.code === 'ENOTFOUND' || e.code === 'ENODATA')
        ? 'Domínio não encontrado no DNS — aguarde a propagação'
        : e.message;
    }

    const newDnsStatus = dnsVerified ? 'active' : 'failed';

    await (this.prisma as any).domain.update({
      where: { id },
      data:  { dnsStatus: newDnsStatus, verifiedAt: dnsVerified ? new Date() : null },
    });

    if (!dnsVerified) {
      return { verified: false, dnsStatus: newDnsStatus, sslStatus: d.sslStatus, addresses, expected: serverIp, error: dnsError };
    }

    // ── 2. Provisionar SSL (certbot via cert-manager) ─────────────────────────
    let sslStatus = 'pending';
    let sslError: string | undefined;

    const certMgrUrl = process.env.CERT_MANAGER_URL;
    if (!certMgrUrl) {
      // Sem cert-manager configurado: mantém sslStatus pending
      sslError = 'CERT_MANAGER_URL não configurado';
    } else {
      try {
        const res = await this.callCertManager('/provision', { domain: d.domain });
        if (res.ok) {
          sslStatus = 'active';
        } else {
          sslStatus = 'failed';
          sslError  = res.error || 'Erro desconhecido no provisionamento SSL';
        }
      } catch (e: any) {
        sslStatus = 'failed';
        sslError  = `Cert-manager indisponível: ${e.message}`;
      }
    }

    const isFullyActive = sslStatus === 'active';
    await (this.prisma as any).domain.update({
      where: { id },
      data:  {
        sslStatus,
        sslIssuedAt: isFullyActive ? new Date() : null,
        isActive:    isFullyActive,
      },
    });

    if (isFullyActive) await this.invalidateCache();

    return {
      verified:  true,
      dnsStatus: 'active',
      sslStatus,
      addresses,
      expected:  serverIp,
      sslError,
    };
  }

  // ── Public ───────────────────────────────────────────────────────────────────

  async findActive(workspaceId?: string): Promise<{ id: string; domain: string; isDefault: boolean; isOwn?: boolean }[]> {
    let globalDomains: { id: string; domain: string; isDefault: boolean }[];

    const cached = await this.redis.get(CACHE_KEY);
    if (cached) {
      globalDomains = JSON.parse(cached);
    } else {
      globalDomains = await (this.prisma as any).domain.findMany({
        where:   { isActive: true, dnsStatus: 'active', sslStatus: 'active', hiddenFromPicker: false, workspaceId: null },
        orderBy: { domain: 'asc' },
        select:  { id: true, domain: true, isDefault: true },
      });
      await this.redis.set(CACHE_KEY, JSON.stringify(globalDomains), 'EX', CACHE_TTL);
    }

    if (!workspaceId) return globalDomains;

    // Domínios próprios desse workspace, já verificados — busca sempre fresca
    // (sem cache), já que é uma lista pequena e específica por conta.
    const ownDomains = await (this.prisma as any).domain.findMany({
      where:   { workspaceId, isActive: true, dnsStatus: 'active', sslStatus: 'active' },
      orderBy: { domain: 'asc' },
      select:  { id: true, domain: true, isDefault: true },
    });

    return [...globalDomains, ...ownDomains.map((d: any) => ({ ...d, isOwn: true }))];
  }

  getServerIp(): string {
    return process.env.SERVER_IP || '';
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Só domínios globais — reforça a separação estrita entre admin e workspace
  // (um domínio de conta nunca pode ser manipulado por uma rota do admin).
  private async findOrFail(id: string) {
    const d = await (this.prisma as any).domain.findFirst({ where: { id, workspaceId: null } });
    if (!d) throw new NotFoundException('Domínio não encontrado');
    return d;
  }

  private sanitize(raw: string): string {
    return raw.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  }

  private validate(domain: string) {
    const re = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]{2,})+$/;
    if (!re.test(domain)) throw new BadRequestException('Formato de domínio inválido');
  }

  private newId(): string {
    return randomUUID();
  }

  private async invalidateCache() {
    await this.redis.del(CACHE_KEY);
  }

  private async callCertManager(path: string, body: object): Promise<any> {
    const url      = process.env.CERT_MANAGER_URL + path;
    const controller = new AbortController();
    const timeout  = setTimeout(() => controller.abort(), 120_000); // 2 min timeout
    try {
      const res  = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });
      return await res.json();
    } finally {
      clearTimeout(timeout);
    }
  }
}
