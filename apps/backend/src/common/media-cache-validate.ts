import axios from 'axios';

/**
 * Valida um file_id cacheado contra o `getFile` do Telegram — o `getFlowCacheStatus`
 * sozinho só checa se a STRING existe, então um file_id de outro bot (fluxo
 * duplicado) passava como "cacheado" e todo envio falhava.
 *
 * Memoiza o resultado no Redis por 1h: `mcv:<últimos6dotoken>:<fileId>` = "1"/"0".
 * Erro de rede (não "id inválido") → assume válido: nunca regride pra pior que o
 * comportamento atual.
 */

const TTL_OK = 3600;     // file_id bom: revalida a cada 1h
const TTL_BAD = 900;     // file_id ruim: re-tenta em 15min (pode ter sido corrigido)

export async function isFileIdValid(
  redis: { get(k: string): Promise<string | null>; set(k: string, v: string, mode: string, ttl: number): Promise<unknown> },
  botToken: string,
  fileId: string | undefined | null,
): Promise<boolean> {
  if (!fileId) return false;
  const key = `mcv:${botToken.slice(-6)}:${fileId}`;

  try {
    const cached = await redis.get(key);
    if (cached === '1') return true;
    if (cached === '0') return false;
  } catch {
    /* redis fora — segue pro getFile */
  }

  let ok: boolean;
  try {
    const r = await axios.get(`https://api.telegram.org/bot${botToken}/getFile`, {
      params: { file_id: fileId },
      timeout: 15_000,
    });
    ok = !!r.data?.ok;
  } catch (e: any) {
    const desc = e?.response?.data?.description || '';
    if (/too big/i.test(desc)) {
      ok = true; // file_id válido, só grande demais pra baixar — serve pro envio
    } else if (e?.response?.status === 400) {
      ok = false; // "wrong file identifier" e afins
    } else {
      return true; // rede/timeout/5xx — não dá pra afirmar que é ruim
    }
  }

  try {
    await redis.set(key, ok ? '1' : '0', 'EX', ok ? TTL_OK : TTL_BAD);
  } catch {
    /* best-effort */
  }
  return ok;
}
