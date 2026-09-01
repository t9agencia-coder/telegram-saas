import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Guard global (substitui o ThrottlerGuard padrão como APP_GUARD). O endpoint
// público /redirectors/resolve/:slug só é chamado server-to-server pelo Next.js
// (route.ts do /r/[slug]) — nunca direto pelo navegador do visitante — então o
// req.ip padrão é sempre o IP interno do container do frontend, o mesmo pra
// TODOS os cliques de TODOS os redirecionadores da plataforma. Isso fazia um
// único balde de rate limit (30 req/min) ser compartilhado pela plataforma
// inteira, derrubando visitantes reais em 429 sob tráfego normal de campanha.
//
// route.ts já envia o IP real do visitante (a partir do X-Forwarded-For) no
// corpo da requisição como `ip`. Usa esse valor quando presente — em qualquer
// outro endpoint do app (login, admin, etc.) o corpo nunca tem esse campo, então
// cai no req.ip normal, sem nenhuma mudança de comportamento.
@Injectable()
export class SmartThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.body?.ip || req.ip;
  }
}
