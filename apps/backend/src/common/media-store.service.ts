import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { PrismaService } from './prisma.service';

/**
 * Mídia-teca — a fonte da verdade das mídias dos fluxos.
 *
 * Antes disso, o caminho de uma mídia era: base64 dentro do JSON do fluxo →
 * warmup manda pro Telegram → guarda o file_id → APAGA o base64. A partir daí o
 * Telegram virava a única cópia, e ela só abre com o token daquele bot: trocar
 * (ou pior, excluir) o bot matava todos os file_id de uma vez e a mídia sumia do
 * sistema. O cliente tinha que reenviar 10–15 vídeos na mão, toda vez.
 *
 * Aqui o arquivo passa a ser nosso. O file_id do Telegram vira cache derivado —
 * se sumir, expirar ou pertencer a outro bot, é só reenviar a partir do disco.
 *
 * Layout em disco (volume `media_data`, montado em /app/media):
 *     /app/media/<2 primeiros do sha>/<sha256>
 * O caminho vem do conteúdo, então o mesmo arquivo enviado em 5 fluxos ocupa
 * disco uma vez só. Gravação é atômica (arquivo temporário + rename) pra nunca
 * deixar um arquivo pela metade se o processo cair no meio.
 */

const MEDIA_ROOT = process.env.MEDIA_ROOT || '/app/media';

export interface StoredAsset {
  id: string;
  sha256: string;
  sizeBytes: number;
  mime: string;
  type: 'photo' | 'video';
  /** true quando o arquivo já existia (mesmo conteúdo) e foi reaproveitado */
  deduped: boolean;
}

@Injectable()
export class MediaStoreService {
  private readonly logger = new Logger(MediaStoreService.name);

  constructor(private readonly prisma: PrismaService) {}

  private pathFor(sha256: string): string {
    return path.join(MEDIA_ROOT, sha256.slice(0, 2), sha256);
  }

  /** Bytes de um data URI (`data:video/mp4;base64,...`). Null se malformado. */
  static parseDataUri(dataUri: string): { buf: Buffer; mime: string } | null {
    const m = dataUri.match(/^data:(.+?);base64,(.+)$/s);
    if (!m) return null;
    try {
      return { buf: Buffer.from(m[2], 'base64'), mime: m[1] };
    } catch {
      return null;
    }
  }

  /**
   * Grava os bytes na mídia-teca e registra (ou reaproveita) a linha no banco.
   * Idempotente: mesmo conteúdo no mesmo workspace devolve sempre o mesmo asset.
   */
  async store(
    workspaceId: string,
    buf: Buffer,
    opts: { mime: string; type: 'photo' | 'video'; originalName?: string },
  ): Promise<StoredAsset> {
    const sha256 = createHash('sha256').update(buf).digest('hex');
    const dest = this.pathFor(sha256);

    // 1) arquivo em disco — se já existe com o tamanho certo, não regrava
    let fileAlreadyThere = false;
    try {
      const st = await fs.stat(dest);
      fileAlreadyThere = st.size === buf.length;
    } catch {
      /* não existe — grava abaixo */
    }

    if (!fileAlreadyThere) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      // Temporário + rename: o rename é atômico no mesmo filesystem, então
      // ninguém nunca enxerga um arquivo parcial em `dest`.
      const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
      await fs.writeFile(tmp, buf);
      await fs.rename(tmp, dest);
    }

    // 2) linha no banco (upsert pelo par workspace+conteúdo)
    const existing = await this.prisma.mediaAsset.findUnique({
      where: { workspaceId_sha256: { workspaceId, sha256 } },
    });

    if (existing) {
      await this.prisma.mediaAsset
        .update({ where: { id: existing.id }, data: { lastUsedAt: new Date() } })
        .catch(() => {});
      return {
        id: existing.id,
        sha256,
        sizeBytes: existing.sizeBytes,
        mime: existing.mime,
        type: existing.type as 'photo' | 'video',
        deduped: true,
      };
    }

    const created = await this.prisma.mediaAsset.create({
      data: {
        workspaceId,
        sha256,
        mime: opts.mime,
        type: opts.type,
        sizeBytes: buf.length,
        originalName: opts.originalName?.slice(0, 200),
      },
    });

    this.logger.log(
      `mídia guardada: ${(buf.length / 1024 / 1024).toFixed(2)} MB ` +
      `(${opts.type}, ${opts.mime}) sha=${sha256.slice(0, 12)} ws=${workspaceId}`,
    );

    return {
      id: created.id,
      sha256,
      sizeBytes: created.sizeBytes,
      mime: created.mime,
      type: created.type as 'photo' | 'video',
      deduped: false,
    };
  }

  /** Lê os bytes de um asset. Null se a linha ou o arquivo sumiram. */
  async read(assetId: string): Promise<{ buf: Buffer; mime: string; type: 'photo' | 'video' } | null> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (!asset) return null;
    try {
      const buf = await fs.readFile(this.pathFor(asset.sha256));
      return { buf, mime: asset.mime, type: asset.type as 'photo' | 'video' };
    } catch (e: any) {
      this.logger.warn(`asset ${assetId} sem arquivo em disco (sha=${asset.sha256.slice(0, 12)}): ${e.message}`);
      return null;
    }
  }

  /** O arquivo desse asset realmente existe em disco? (sem carregar os bytes) */
  async exists(assetId: string): Promise<boolean> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { sha256: true },
    });
    if (!asset) return false;
    try {
      await fs.stat(this.pathFor(asset.sha256));
      return true;
    } catch {
      return false;
    }
  }

  /** Uso de disco da mídia-teca — pra painel/diagnóstico. */
  async usage(): Promise<{ assets: number; totalBytes: number }> {
    const r = await this.prisma.mediaAsset.aggregate({
      _count: { id: true },
      _sum: { sizeBytes: true },
    });
    return { assets: r._count.id, totalBytes: r._sum.sizeBytes ?? 0 };
  }
}
