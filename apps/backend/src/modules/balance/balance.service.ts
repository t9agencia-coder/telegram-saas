import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { encrypt, decrypt } from '../../common/utils/encryption';

// Singleton — sempre a mesma linha, nunca precisa de findFirst/race condition pra criar.
const BALANCE_CONFIG_ID = '00000000-0000-0000-0000-000000000001';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Registros criados antes desta correção salvaram a chave PIX em texto puro
// (sem "iv:ciphertext"); decrypt() lançaria erro nesses casos — devolve o
// valor bruto como fallback até que a migração de dados antigos rode.
function safeDecryptPixKey(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

@Injectable()
export class BalanceService {
  private readonly logger = new Logger(BalanceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Config global da taxa ──────────────────────────────────────────────────

  async getConfig() {
    const cfg = await this.prisma.balanceConfig.findUnique({ where: { id: BALANCE_CONFIG_ID } });
    if (cfg) return cfg;
    // Só acontece se a migration (que já semeia a linha padrão) não tiver rodado ainda
    return this.prisma.balanceConfig.upsert({
      where:  { id: BALANCE_CONFIG_ID },
      create: { id: BALANCE_CONFIG_ID, feeType: 'FIXED', feeValue: 0.30, withdrawalFee: 5.00 },
      update: {},
    });
  }

  async setConfig(feeType: 'FIXED' | 'PERCENTAGE', feeValue: number, withdrawalFee: number) {
    if (feeValue < 0) throw new BadRequestException('Valor da taxa não pode ser negativo');
    if (withdrawalFee < 0) throw new BadRequestException('Taxa de saque não pode ser negativa');
    return this.prisma.balanceConfig.upsert({
      where:  { id: BALANCE_CONFIG_ID },
      create: { id: BALANCE_CONFIG_ID, feeType, feeValue, withdrawalFee },
      update: { feeType, feeValue, withdrawalFee },
    });
  }

  calculateFee(amount: number, config: { feeType: string; feeValue: any }): number {
    const feeValue = Number(config.feeValue);
    if (config.feeType === 'PERCENTAGE') return round2(amount * (feeValue / 100));
    return round2(feeValue);
  }

  // ── Crédito de saldo por venda aprovada ─────────────────────────────────────
  // Chamado em fire-and-forget pelo PixService assim que um pagamento vira APPROVED.
  // Idempotente: nunca credita duas vezes o mesmo pagamento (flag balanceCredited +
  // paymentId único em BalanceTransaction como segunda trava no próprio banco).
  async creditForPayment(paymentId: string): Promise<void> {
    const credited = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where:  { id: paymentId },
        include: { lead: { select: { workspaceId: true } } },
      });
      if (!payment) return false;
      if (payment.balanceCredited) return false;
      if (payment.status !== 'APPROVED') return false;

      const workspaceId = payment.lead.workspaceId;
      const config = await tx.balanceConfig.findUnique({ where: { id: BALANCE_CONFIG_ID } });
      const gross = Number(payment.amount);
      const fee = this.calculateFee(gross, config ?? { feeType: 'FIXED', feeValue: 0.30 });
      const net = round2(gross - fee);

      await tx.workspaceBalance.upsert({
        where:  { workspaceId },
        create: { workspaceId, available: net, totalReceived: net },
        update: { available: { increment: net }, totalReceived: { increment: net } },
      });

      await tx.balanceTransaction.create({
        data: {
          workspaceId, type: 'SALE',
          grossAmount: gross, feeAmount: fee, netAmount: net,
          paymentId, status: 'COMPLETED',
        },
      });

      await tx.payment.update({ where: { id: paymentId }, data: { balanceCredited: true } });
      return true;
    });

    if (credited) this.logger.log(`Saldo creditado para pagamento=${paymentId}`);
  }

  // ── Consulta de saldo e extrato ──────────────────────────────────────────────

  async getWorkspaceBalance(workspaceId: string) {
    const [balance, salesCount, config] = await Promise.all([
      this.prisma.workspaceBalance.findUnique({ where: { workspaceId } }),
      this.prisma.balanceTransaction.count({ where: { workspaceId, type: 'SALE' } }),
      this.getConfig(),
    ]);
    return {
      available:      balance ? Number(balance.available) : 0,
      totalReceived:  balance ? Number(balance.totalReceived) : 0,
      totalWithdrawn: balance ? Number(balance.totalWithdrawn) : 0,
      salesCount,
      withdrawalFee:  Number(config.withdrawalFee),
    };
  }

  async listTransactions(workspaceId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [transactions, total] = await Promise.all([
      this.prisma.balanceTransaction.findMany({
        where:   { workspaceId },
        orderBy: { createdAt: 'desc' },
        skip, take: limit,
      }),
      this.prisma.balanceTransaction.count({ where: { workspaceId } }),
    ]);
    return { transactions, total, page, limit };
  }

  async listWorkspaceWithdrawals(workspaceId: string) {
    const list = await this.prisma.balanceWithdrawal.findMany({
      where:   { workspaceId },
      orderBy: { requestedAt: 'desc' },
    });
    return list.map(w => ({ ...w, pixKey: safeDecryptPixKey(w.pixKey) }));
  }

  // ── Saque ────────────────────────────────────────────────────────────────────
  // O valor sai do saldo disponível já na hora do pedido (fica "reservado" até o
  // admin decidir) — evita que 2 pedidos simultâneos juntos ultrapassem o saldo.
  // Toda solicitação cobra a taxa de saque configurada: o valor pedido sai integral
  // do saldo, e o que é de fato pago via PIX é o valor pedido menos a taxa.
  async requestWithdrawal(
    workspaceId: string,
    amount: number,
    pixKeyType: string,
    pixKey: string,
  ) {
    if (!(amount > 0)) throw new BadRequestException('Valor inválido');
    const amountRounded = round2(amount);

    const config = await this.getConfig();
    const withdrawalFee = round2(Number(config.withdrawalFee));
    if (amountRounded <= withdrawalFee) {
      throw new BadRequestException(
        `O valor do saque deve ser maior que a taxa de saque (${withdrawalFee.toFixed(2)})`,
      );
    }
    const netAmount = round2(amountRounded - withdrawalFee);

    return this.prisma.$transaction(async (tx) => {
      // Decremento condicional atômico: só afeta a linha se available >= amount,
      // então corrige a corrida entre pedidos simultâneos sem precisar de lock manual.
      const result = await tx.workspaceBalance.updateMany({
        where: { workspaceId, available: { gte: amountRounded } },
        data:  { available: { decrement: amountRounded } },
      });
      if (result.count === 0) {
        throw new BadRequestException('Saldo disponível insuficiente');
      }

      const withdrawal = await tx.balanceWithdrawal.create({
        data: {
          workspaceId, amount: amountRounded, feeAmount: withdrawalFee, netAmount,
          pixKeyType, pixKey: encrypt(pixKey), status: 'PENDING',
        },
      });

      await tx.balanceTransaction.create({
        data: {
          workspaceId, type: 'WITHDRAWAL',
          grossAmount: amountRounded, feeAmount: withdrawalFee, netAmount: -amountRounded,
          withdrawalId: withdrawal.id, status: 'PENDING',
        },
      });

      return withdrawal;
    });
  }

  // ── Aprovação/rejeição (admin) ───────────────────────────────────────────────

  async listWithdrawals(status?: string) {
    const list = await this.prisma.balanceWithdrawal.findMany({
      where:   status ? { status } : undefined,
      orderBy: { requestedAt: 'desc' },
      include: { workspace: { select: { id: true, name: true } } },
    });
    // Admin precisa da chave em claro pra processar o PIX de saque manualmente
    return list.map(w => ({ ...w, pixKey: safeDecryptPixKey(w.pixKey) }));
  }

  async approveWithdrawal(withdrawalId: string) {
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.balanceWithdrawal.findUnique({ where: { id: withdrawalId } });
      if (!w) throw new NotFoundException('Solicitação de saque não encontrada');
      if (w.status !== 'PENDING') throw new BadRequestException('Solicitação já foi resolvida');

      // O valor já saiu do "available" no momento do pedido — só falta contabilizar o total sacado.
      await tx.workspaceBalance.update({
        where: { workspaceId: w.workspaceId },
        data:  { totalWithdrawn: { increment: w.amount } },
      });

      await tx.balanceTransaction.updateMany({
        where: { withdrawalId },
        data:  { status: 'COMPLETED' },
      });

      return tx.balanceWithdrawal.update({
        where: { id: withdrawalId },
        data:  { status: 'APPROVED', resolvedAt: new Date() },
      });
    });
  }

  async rejectWithdrawal(withdrawalId: string, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const w = await tx.balanceWithdrawal.findUnique({ where: { id: withdrawalId } });
      if (!w) throw new NotFoundException('Solicitação de saque não encontrada');
      if (w.status !== 'PENDING') throw new BadRequestException('Solicitação já foi resolvida');

      // Devolve o valor reservado pro saldo disponível.
      await tx.workspaceBalance.update({
        where: { workspaceId: w.workspaceId },
        data:  { available: { increment: w.amount } },
      });

      await tx.balanceTransaction.updateMany({
        where: { withdrawalId },
        data:  { status: 'REJECTED' },
      });

      return tx.balanceWithdrawal.update({
        where: { id: withdrawalId },
        data:  { status: 'REJECTED', resolvedAt: new Date(), rejectReason: reason },
      });
    });
  }
}
