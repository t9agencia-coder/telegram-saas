import { Request } from 'express';

// req.ip já resolve corretamente o IP real via `trust proxy: 1` (main.ts) — o
// Nginx do host sempre ACRESCENTA o IP de quem conectou nele como a última
// entrada de X-Forwarded-For, e o Express com trust proxy configurado lê
// exatamente essa entrada (não a primeira, que o próprio cliente controla).
// Não faça parsing manual do header aqui: pegar a primeira entrada permitia
// qualquer um forjar o IP registrado só mandando um X-Forwarded-For próprio
// (funciona porque a porta do backend não é mais acessível direto de fora,
// só via Nginx — ver incidente de segurança de 16-17/07/2026).
export function getClientIp(req: Request): string | undefined {
  return req.ip;
}
