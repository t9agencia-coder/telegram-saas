/**
 * Utilitário central para envio de mídia ao Telegram.
 *
 * Tenta em cascata:
 *   1. file_id cacheado        → mais rápido, zero upload
 *   2. URL pública             → Telegram baixa direto da origem
 *   3. multipart upload (base64) → mais lento, mas sempre funciona
 *
 * Se o file_id estiver expirado/inválido, o fallback ocorre automaticamente
 * e o novo file_id é retornado para que o caller possa atualizar o cache.
 * Em caso de falha total, lança exceção com o body de erro do Telegram incluso.
 */

import axios, { AxiosError } from 'axios';
import * as FormData from 'form-data';
import { Logger } from '@nestjs/common';

const log = new Logger('TelegramMedia');

const VIDEO_EXT: Record<string, string> = {
  'video/mp4':       'mp4',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska':'mkv',
  'video/webm':      'webm',
  'video/mpeg':      'mpeg',
};

// Limites reais do Telegram Bot API — bem diferentes entre si. Legenda de
// foto/vídeo é MUITO mais curta que uma mensagem de texto normal; enviar
// uma legenda maior que 1024 caracteres retorna 400 "message caption is
// too long" sempre, não importa quantas vezes tente de novo.
const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_MESSAGE_LIMIT = 4096;

export interface TelegramMediaParams {
  botToken:     string;
  chatId:       string | number;
  type:         'photo' | 'video';
  /** Tentado primeiro — string curta, sem upload */
  fileId?:      string;
  /** Tentado segundo — Telegram baixa da URL */
  fileUrl?:     string;
  /** Tentado terceiro — data:mime;base64,... */
  fileData?:    string;
  caption?:     string;
  parseMode?:   string;
  replyMarkup?: any;
}

export interface TelegramMediaResult {
  /** message_id da mensagem enviada, ou null se falhou silenciosamente */
  messageId: number | null;
  /**
   * file_id retornado pelo Telegram após o envio.
   * Persista-o em DB para as próximas chamadas.
   * null quando enviado via file_id cacheado (ID já era conhecido).
   */
  fileId: string | null;
}

function describeError(e: unknown): string {
  const body = (e as AxiosError)?.response?.data as any;
  return body?.description ?? body?.error ?? (e as Error)?.message ?? String(e);
}

function extractFileId(result: any, type: 'photo' | 'video'): string | null {
  if (type === 'photo') {
    const arr = result?.photo;
    return Array.isArray(arr) ? (arr[arr.length - 1]?.file_id ?? null) : null;
  }
  return result?.video?.file_id ?? null;
}

// Quando a legenda originalmente pedida é grande demais pro limite de
// legenda do Telegram, a mídia já sai sem ela (ver captionTooLong em
// sendTelegramMedia) — esse follow-up manda o texto completo como mensagem
// separada logo em seguida, preservando o conteúdo e os botões (que fazem
// mais sentido junto do texto do que colados numa legenda vazia). Melhor
// esforço: se esse envio falhar, a mídia já enviada não é desfeita nem a
// função inteira falha por causa disso.
async function sendFollowUpText(
  botToken: string,
  chatId: string | number,
  text: string,
  parseMode: string,
  replyMarkup: any,
): Promise<void> {
  try {
    const body: any = {
      chat_id: chatId,
      text: text.slice(0, TELEGRAM_MESSAGE_LIMIT),
      parse_mode: parseMode,
      protect_content: true,
    };
    if (replyMarkup) body.reply_markup = replyMarkup;
    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, body, { timeout: 15_000 });
  } catch (e) {
    log.warn(`[TelegramMedia] Falha ao enviar legenda longa como mensagem separada: ${describeError(e)}`);
  }
}

export async function sendTelegramMedia(p: TelegramMediaParams): Promise<TelegramMediaResult> {
  const { botToken, chatId, type, fileId, fileUrl, fileData,
          caption, parseMode = 'HTML', replyMarkup } = p;

  // Legenda maior que o limite do Telegram: a mídia sai sem legenda (fica
  // undefined nos 3 caminhos abaixo) e o texto completo + os botões vão como
  // mensagem de texto separada depois que a mídia for enviada com sucesso.
  const captionTooLong = !!caption && caption.length > TELEGRAM_CAPTION_LIMIT;
  const mediaCaption   = captionTooLong ? undefined : caption;
  const mediaReplyMarkup = captionTooLong ? undefined : replyMarkup;
  if (captionTooLong) {
    log.warn(
      `[TelegramMedia] Legenda com ${caption!.length} caracteres excede o limite de ${TELEGRAM_CAPTION_LIMIT} ` +
      `→ type=${type} chatId=${chatId} — enviando mídia sem legenda + texto completo em mensagem separada`,
    );
  }

  const method = type === 'photo' ? 'sendPhoto' : 'sendVideo';
  const field  = type === 'photo' ? 'photo'     : 'video';
  const apiUrl = `https://api.telegram.org/bot${botToken}/${method}`;

  // ── Tentativa 1: file_id cacheado ────────────────────────────────────────────
  if (fileId) {
    try {
      const body: any = { chat_id: chatId, [field]: fileId, parse_mode: parseMode, protect_content: true };
      if (mediaCaption)     body.caption      = mediaCaption;
      if (mediaReplyMarkup) body.reply_markup = mediaReplyMarkup;
      const r = await axios.post(apiUrl, body, { timeout: 15_000 });
      if (captionTooLong) await sendFollowUpText(botToken, chatId, caption!, parseMode, replyMarkup);
      return { messageId: r.data?.result?.message_id ?? null, fileId: null };
    } catch (e) {
      const desc = describeError(e);
      // Erros fatais de chat — não é falha do file_id, fallback não resolve
      if (
        desc.includes('bot was blocked by the user') ||
        desc.includes('user is deactivated') ||
        desc.includes('chat not found') ||
        desc.includes('bot was kicked')
      ) {
        throw new Error(desc);
      }
      log.warn(
        `[TelegramMedia] file_id inválido/expirado (${desc}) ` +
        `→ type=${type} chatId=${chatId} — fallback para upload`,
      );
      // Continua para próxima tentativa; caller deve invalidar o cache
    }
  }

  // ── Tentativa 2: URL pública ──────────────────────────────────────────────────
  if (fileUrl) {
    try {
      const body: any = { chat_id: chatId, [field]: fileUrl, parse_mode: parseMode, protect_content: true };
      if (mediaCaption)     body.caption      = mediaCaption;
      if (mediaReplyMarkup) body.reply_markup = mediaReplyMarkup;
      const r = await axios.post(apiUrl, body, { timeout: 30_000 });
      const newId = extractFileId(r.data?.result, type);
      if (captionTooLong) await sendFollowUpText(botToken, chatId, caption!, parseMode, replyMarkup);
      return { messageId: r.data?.result?.message_id ?? null, fileId: newId };
    } catch (e) {
      const desc = describeError(e);
      if (fileData) {
        log.warn(`[TelegramMedia] URL falhou (${desc}) → tentando upload base64`);
      } else {
        log.error(`[TelegramMedia] URL falhou (${desc}) e sem base64 disponível`);
        throw new Error(`Telegram rejeitou URL: ${desc}`);
      }
    }
  }

  // ── Tentativa 3: multipart upload (base64) ────────────────────────────────────
  if (fileData) {
    const matches = fileData.match(/^data:(.+?);base64,(.+)$/s);
    if (!matches) {
      log.warn('[TelegramMedia] base64 malformado — abortando envio de mídia');
      return { messageId: null, fileId: null };
    }
    const mime = matches[1];
    const raw  = Buffer.from(matches[2], 'base64');
    const ext  = type === 'photo' ? (mime.split('/')[1] || 'jpg') : (VIDEO_EXT[mime] || 'mp4');

    const form = new FormData();
    form.append('chat_id',        chatId.toString());
    form.append(field,            raw, { filename: `media.${ext}`, contentType: mime });
    form.append('parse_mode',     parseMode);
    form.append('protect_content','true');
    if (mediaCaption)     form.append('caption',      mediaCaption);
    if (mediaReplyMarkup) form.append('reply_markup', JSON.stringify(mediaReplyMarkup));

    try {
      const r = await axios.post(apiUrl, form, {
        headers: form.getHeaders(),
        timeout: 120_000, // vídeos grandes podem demorar
      });
      const newId = extractFileId(r.data?.result, type);
      log.log(`[TelegramMedia] Upload OK → type=${type} chatId=${chatId} file_id=${newId ?? 'N/A'}`);
      if (captionTooLong) await sendFollowUpText(botToken, chatId, caption!, parseMode, replyMarkup);
      return { messageId: r.data?.result?.message_id ?? null, fileId: newId };
    } catch (e) {
      log.error(`[TelegramMedia] Upload base64 falhou → ${describeError(e)}`);
      throw new Error(`Falha ao enviar mídia ao Telegram: ${describeError(e)}`);
    }
  }

  log.warn('[TelegramMedia] Nenhuma fonte de mídia fornecida (fileId, fileUrl ou fileData)');
  return { messageId: null, fileId: null };
}
