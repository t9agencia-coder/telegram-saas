import { Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import maxmind, { CityResponse, Reader } from 'maxmind';

// Localização por IP com a base DB-IP City Lite baixada no build da imagem
// (Dockerfile.backend → /app/geo/dbip-city.mmdb). Consulta 100% local.
// Sem a base (dev local, download falhou) devolve tudo vazio — nunca quebra.
const ARQUIVO = process.env.GEOIP_DB || '/app/geo/dbip-city.mmdb';
const logger = new Logger('GeoIp');

let leitor: Promise<Reader<CityResponse> | null> | null = null;

function abrir() {
  if (!leitor) {
    leitor = existsSync(ARQUIVO)
      ? maxmind.open<CityResponse>(ARQUIVO).catch((e) => {
          logger.warn(`Base de localização indisponível: ${e?.message}`);
          return null;
        })
      : Promise.resolve(null);
  }
  return leitor;
}

/** true quando a base de localização abriu — sem ela o filtro de país fica sem efeito. */
export async function baseGeoDisponivel(): Promise<boolean> {
  return !!(await abrir());
}

export interface Localizacao {
  country: string | null; // sigla: BR
  region:  string | null; // estado: São Paulo
  city:    string | null; // cidade: Campinas
}

const nome = (n?: Record<string, string>) => (n && (n['pt-BR'] || n.en)) || null;

export async function localizarIp(ip?: string | null): Promise<Localizacao> {
  const vazio = { country: null, region: null, city: null };
  if (!ip) return vazio;
  try {
    const r = await abrir();
    const limpo = ip.trim().replace(/^::ffff:/i, '');
    if (!r || !maxmind.validate(limpo)) return vazio;
    const d = r.get(limpo);
    if (!d) return vazio;
    return {
      country: d.country?.iso_code || null,
      region:  nome(d.subdivisions?.[0]?.names as any),
      city:    nome(d.city?.names as any),
    };
  } catch {
    return vazio;
  }
}
