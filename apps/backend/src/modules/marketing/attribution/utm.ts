/**
 * Formato UTMify usado nos links: `utm_campaign={{campaign.name}}|{{campaign.id}}`
 * (idem adset em utm_medium, ad em utm_content). O valor pode vir como
 * "Nome|123", só "123", só "Nome", ou vazio.
 */
export interface NameId {
  raw: string | null;
  /** id do Facebook (só dígitos, >= 5) quando dá pra extrair */
  id: string | null;
  /** nome legível quando presente */
  name: string | null;
}

const FB_ID_RE = /^\d{5,}$/;

export function parseNameId(v: string | null | undefined): NameId {
  const raw = (v ?? '').trim() || null;
  if (!raw) return { raw: null, id: null, name: null };

  const parts = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';

  if (FB_ID_RE.test(last)) {
    return { raw, id: last, name: parts.length > 1 ? parts.slice(0, -1).join('|') : null };
  }
  // sem id numérico no fim — trata tudo como nome
  return { raw, id: null, name: raw };
}

/** utm_source parece Facebook/Meta? */
export function isMetaSource(utmSource: string | null | undefined): boolean {
  const s = (utmSource ?? '').toLowerCase();
  return ['fb', 'facebook', 'meta', 'ig', 'instagram', 'an', 'msg'].includes(s);
}
