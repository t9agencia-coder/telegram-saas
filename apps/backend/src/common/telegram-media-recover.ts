import axios from 'axios';
import * as FormData from 'form-data';

/**
 * Recuperação de file_id "meio-morto": o Telegram recusa o file_id no envio
 * (`sendVideo`/`sendPhoto`) mas ainda deixa BAIXAR o arquivo por ele (`getFile`).
 * Acontece quando o file_id foi gerado em outro contexto/bot. A saída é:
 * getFile → download → re-upload multipart pelo MESMO bot → file_id novo, esse
 * sim reenviável.
 *
 * Só serve quando `getFile` funciona. Se o file_id está 100% morto (getFile
 * também falha), retorna null e o chamador tem que cair no base64/fileUrl ou
 * pedir reenvio ao usuário.
 *
 * Limite do Bot API: getFile só baixa arquivos até ~20 MB.
 */

const TG = 'https://api.telegram.org';

export interface RecoverResult {
  fileId: string;
  messageId: number | null;
}

export async function recoverTelegramFileId(
  botToken: string,
  deadFileId: string,
  chatId: string | number,
  type: 'photo' | 'video',
): Promise<RecoverResult | null> {
  let filePath: string;
  try {
    const gf = await axios.get(`${TG}/bot${botToken}/getFile`, {
      params: { file_id: deadFileId },
      timeout: 15_000,
    });
    filePath = gf.data?.result?.file_path;
    if (!filePath) return null;
  } catch {
    return null; // getFile falhou — file_id irrecuperável por aqui
  }

  let buf: Buffer;
  try {
    const dl = await axios.get(`${TG}/file/bot${botToken}/${filePath}`, {
      responseType: 'arraybuffer',
      timeout: 90_000,
      maxContentLength: 25 * 1024 * 1024,
    });
    buf = Buffer.from(dl.data);
  } catch {
    return null;
  }

  const field = type === 'photo' ? 'photo' : 'video';
  const method = type === 'photo' ? 'sendPhoto' : 'sendVideo';
  const ext = type === 'photo' ? 'jpg' : 'mp4';
  const mime = type === 'photo' ? 'image/jpeg' : 'video/mp4';

  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append(field, buf, { filename: `media.${ext}`, contentType: mime });
  form.append('protect_content', 'true');
  form.append('disable_notification', 'true');

  try {
    const up = await axios.post(`${TG}/bot${botToken}/${method}`, form, {
      headers: form.getHeaders(),
      timeout: 120_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const r = up.data?.result;
    const newId =
      type === 'photo'
        ? r?.photo?.[r.photo.length - 1]?.file_id
        : r?.video?.file_id ?? r?.document?.file_id;
    if (!newId) return null;
    return { fileId: newId, messageId: r?.message_id ?? null };
  } catch {
    return null;
  }
}
