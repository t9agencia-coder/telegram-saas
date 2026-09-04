# Isolar o redirect (`/r/`) num processo dedicado — plano de execução

> **Motivo:** 2026-09-04 o XBot caiu ~15 min (índice faltando na `Lead`) e o `/r/`
> caiu junto, porque **resolve roda no mesmo processo `xbot-backend` que serve o
> dashboard e os webhooks**. Ponto único de falha na função que gera receita.
> Índices já corrigidos (ver [[incidente-2026-09-04-payments-index]]); isto é a
> blindagem pra próxima vez que o backend saturar por qualquer motivo.
>
> **Status:** plano pra revisão. Executar em 2 fases.

---

## Arquitetura hoje

```
cliente → nginx → xbot-frontend:3010  (/r/[slug]/route.ts)
                        │  fetch POST http://backend:3001/api/redirectors/resolve/:slug
                        ▼
                  xbot-backend:3011  ← MESMO processo que serve /api/workspaces/*,
                                       /api/webhooks/*, dashboard, tudo.
```
- `xbot-backend` `QUEUE_ROLE=api` — HTTP de tudo + filas de fluxo (`telegram-updates`).
- `xbot-backend-standby` `QUEUE_ROLE=worker` (porta 3012) — blue-green + 3º worker.
- `xbot-worker` / `xbot-worker-2` `QUEUE_ROLE=worker` — só filas pesadas, sem HTTP.
- `route.ts`: `API_URL_INTERNAL` (primário, 5s) → `API_URL_INTERNAL_FALLBACK` (standby, 5s) → senão redireciona pra `/`.

**Único `onModuleInit` do backend inteiro:** `marketing-scheduler.service.ts`
(já ignora `QUEUE_ROLE=api`). Nenhum outro módulo faz trabalho no boot — confirmado
por `grep onModuleInit|OnApplicationBootstrap`.

---

## FASE 1 — container dedicado `xbot-redirect` (a isolação)

Roda a **mesma imagem** do backend, **mesmo AppModule**, com um `QUEUE_ROLE` novo
que **não sobe nenhum `@Processor`** — é só um servidor HTTP + produtores de fila.
Pool Postgres próprio (10 conexões reservadas), event loop próprio, memória própria.

### 1.1 `apps/backend/src/common/queue-role.ts`

```diff
-/** telegram-updates, scheduled-tasks — caminho do /start e continuação de fluxo. */
-export const runsFlowQueues = (): boolean => role !== 'worker';
+/** telegram-updates, scheduled-tasks — caminho do /start e continuação de fluxo. */
+export const runsFlowQueues = (): boolean => role !== 'worker' && role !== 'redirect';

-/** telegram-remarketing, telegram-messages, webhook-events, push, outbound-webhooks. */
-export const runsHeavyQueues = (): boolean => role !== 'api';
+/** telegram-remarketing, telegram-messages, webhook-events, push, outbound-webhooks. */
+export const runsHeavyQueues = (): boolean => role !== 'api' && role !== 'redirect';
```
Comportamento de `api` / `worker` / `all`: **idêntico**. Só adiciona: `redirect`
não roda fila nenhuma.

### 1.2 `apps/backend/src/modules/marketing/marketing-scheduler.service.ts`

```diff
-import { MKT_SYNC_QUEUE, MKT_SALES_QUEUE } from './marketing.constants';
+import { MKT_SYNC_QUEUE, MKT_SALES_QUEUE } from './marketing.constants';
+import { runsHeavyQueues } from '../../common/queue-role';
 ...
   async onModuleInit() {
-    // Evita rodar em processos que não consomem a fila (backend/api): ...
-    if ((process.env.QUEUE_ROLE || 'all').toLowerCase() === 'api') return;
+    // Só onde as filas pesadas rodam (worker/all). No api/redirect é só produtor.
+    if (!runsHeavyQueues()) return;
```
`api` já retornava; `worker`/`all` seguem rodando; `redirect` passa a retornar.

### 1.3 `apps/backend/src/modules/redirectors/redirectors.controller.ts`

Sobe o teto do throttle do `resolve` — 30/min por IP era pouco pra CGNAT de operadora
num pico. Mantém proteção contra abuso (4 req/s por IP é MUITO pra uma pessoa real).

```diff
   @Post('resolve/:slug')
-  @Throttle({ default: { limit: 30, ttl: 60_000 } })
+  @Throttle({ default: { limit: 240, ttl: 60_000 } })
```

### 1.4 `apps/frontend/src/app/r/[slug]/route.ts` — cadeia de fallback

```diff
-  const primaryUrl  = process.env.API_URL_INTERNAL || 'http://localhost:3001';
-  // Standby do blue-green: ...
-  const fallbackUrl = process.env.API_URL_INTERNAL_FALLBACK || 'http://backend-standby:3001';
+  // 1º: instância dedicada só pro redirect (isolada do dashboard/webhooks).
+  // 2º: backend normal.  3º: standby do blue-green.  Qualquer uma resolve igual.
+  const redirectUrl = process.env.API_URL_INTERNAL_REDIRECT || 'http://redirect:3001';
+  const primaryUrl  = process.env.API_URL_INTERNAL          || 'http://localhost:3001';
+  const fallbackUrl = process.env.API_URL_INTERNAL_FALLBACK || 'http://backend-standby:3001';
 ...
   try {
     let res: Response;
     try {
-      res = await tryResolve(primaryUrl, 5000);
+      res = await tryResolve(redirectUrl, 2500);
     } catch {
-      res = await tryResolve(fallbackUrl, 5000); // primário fora → standby
+      try {
+        res = await tryResolve(primaryUrl, 5000);   // dedicado fora (deploy) → backend
+      } catch {
+        res = await tryResolve(fallbackUrl, 5000);  // backend fora → standby
+      }
     }
```

**Blast radius do `xbot-redirect` cair = ZERO** — o `/r/` cai automaticamente pro
`backend` e depois pro `standby`. É puramente aditivo.

### 1.5 `docker-compose.vps.yml` — novo serviço

Inserir depois do `backend-standby` (copiar a env do `worker`, trocar só o marcado):

```yaml
  # ── Redirect (só /api/redirectors/resolve — isolado do dashboard/webhooks) ──
  # Mesma image do backend. QUEUE_ROLE=redirect → NÃO sobe nenhum @Processor,
  # só o servidor HTTP + produtores de fila (enqueuePageView continua funcionando).
  # O route.ts do /r/ chama este container primeiro; se cair, cai pro backend.
  redirect:
    image: xbot-backend:latest
    container_name: xbot-redirect
    environment:
      NODE_ENV: production
      PORT: 3001
      SKIP_MIGRATIONS: "1"
      POSTGRES_HOST: postgres
      POSTGRES_PORT: 5432
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD:?...}@postgres:5432/xbot_saas?schema=public&connection_limit=10
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${REDIS_PASSWORD:?...}
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      JWT_EXPIRATION: 7d
      JWT_REFRESH_EXPIRATION: 7d
      ENCRYPTION_KEY: ${ENCRYPTION_KEY}
      TELEGRAM_WEBHOOK_URL: ${TELEGRAM_WEBHOOK_URL:-https://api.xbot.solutions/api/webhooks/telegram}
      TELEGRAM_WEBHOOK_SECRET: ${TELEGRAM_WEBHOOK_SECRET:-}
      BLACKPAY_API_URL: https://api.blackpay.com.br
      BLACKPAY_API_KEY: ${BLACKPAY_API_KEY:-}
      BLACKPAY_WEBHOOK_SECRET: ${BLACKPAY_WEBHOOK_SECRET:-}
      RECAPTCHA_SECRET_KEY: ${RECAPTCHA_SECRET_KEY:-}
      RESEND_API_KEY: ${RESEND_API_KEY:-}
      RESEND_FROM_EMAIL: ${RESEND_FROM_EMAIL:-}
      FRONTEND_URL: ${FRONTEND_URL:-https://app.xbot.solutions}
      SERVER_IP: ${SERVER_IP:-187.77.247.140}
      CERT_MANAGER_URL: http://cert-manager:3333
      QUEUE_ROLE: redirect            # ← novo
      NODE_HEAP_MB: "896"
      META_APP_ID: ${META_APP_ID:-}
      META_APP_SECRET: ${META_APP_SECRET:-}
      META_OAUTH_REDIRECT_URI: https://api.xbot.solutions/api/tracking/meta/oauth/callback
      META_GRAPH_VERSION: v25.0
      SERVER_PUBLIC_URL: https://api.xbot.solutions
    volumes:
      - ./apps/backend/certs:/app/certs:ro
    ports:
      - "127.0.0.1:3013:3001"      # só localhost, pra smoke-test/health
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
      backend:  { condition: service_started }
    mem_limit: 1g
    memswap_limit: 1g
    restart: unless-stopped
    networks:
      - app-network
```

E no serviço `frontend`, adicionar 1 env (não precisa rebuild pra env nova —
`route.ts` lê em runtime, igual já faz com `API_URL_INTERNAL_FALLBACK`):

```diff
     environment:
       NODE_ENV: production
       API_URL_INTERNAL: http://backend:3001
+      API_URL_INTERNAL_REDIRECT: http://redirect:3001
       NEXT_PUBLIC_API_URL: http://${VPS_IP:-localhost}:3011
```

### 1.6 nginx — **nenhuma mudança**

O `/r/` continua indo pro frontend (`127.0.0.1:3010`). Só muda o alvo interno do
`fetch` dentro do `route.ts`.

### 1.7 Ordem de deploy (blue-green, sem downtime)

1. **Build** `docker compose build backend` (pega 1.1–1.3 — tudo backward-compat).
2. **Sobe só o novo**: `docker compose up -d --no-deps redirect`. Nada depende dele → risco zero.
3. **Smoke-test `xbot-redirect`** (seção 3). Se falhar → `docker compose stop redirect`, aborta, nada mais foi tocado.
4. **Recria standby → backend** (blue-green) com a image nova (pro throttle 240 valer no backend também).
5. **Recria worker → worker-2** (1 a 1) — pegam a image nova; `queue-role`/`scheduler` são no-op pra eles, mas mantém tudo na mesma image.
6. **Build frontend** (1.4) + **recria frontend** com a env `API_URL_INTERNAL_REDIRECT`.
7. Confirma que o `/r/` passou a bater no `xbot-redirect` (log de acesso do container / `docker logs xbot-redirect`).

**Rollback:** parar `xbot-redirect` — o `route.ts` já cai pro `backend` sozinho.
Reverter a env do frontend se quiser. Backend: rollback blue-green normal.

---

## FASE 2 — deixar o `resolve` barato (imune a carga do Postgres)

Só depois da Fase 1 validada. Detalhe completo em [[redirect-latency-plano]] /
`docs/redirect-latency-optimization.md` (#1 select enxuto, #2 paralelizar, #3 cache
do telegramLinkDomain) **+**:

### 2.1 Cache do redirecionador em memória (`redirectors.service.ts`, só afeta `resolve`)

O cliente tem um punhado de slugs ativos. Cachear `slug → objeto do redirector`
(o resultado do `select`) por **15s**:

```ts
private slugCache = new Map<string, { at: number; row: any }>();
private static readonly SLUG_TTL_MS = 15_000;

// dentro do resolve, no lugar do findUnique:
const cached = this.slugCache.get(slug);
let redirector;
if (cached && Date.now() - cached.at < RedirectorsService.SLUG_TTL_MS) {
  redirector = cached.row;
} else {
  redirector = await prismaAny(this.prisma).redirector.findUnique({ where: { slug }, select: {...} });
  this.slugCache.set(slug, { at: Date.now(), row: redirector });
}
```

Com cache hit: `resolve` faz **0 leitura no Postgres** — só `checkBlocked` (que
também dá pra cachear negativamente) e um `logClick` fire-and-forget. **O Postgres
pode estar a 100% e o redirect continua respondendo em <5ms.**

Trade-off: editar/desativar um redirecionador leva até 15s pra refletir no
`xbot-redirect`. Aceitável (é operação rara). Se precisar de invalidação imediata:
um endpoint interno `POST /api/redirectors/_cache/flush` que o backend chama após
`update`/`remove` (Fase 3, opcional).

---

## FASE 3 — replicar no FireBot

Mesmas mudanças de código (já vão estar no git). No `docker-compose` do FireBot:
serviço `redirect` equivalente (`QUEUE_ROLE=redirect`, `telegram_saas`, porta
`127.0.0.1:3014`), env `API_URL_INTERNAL_REDIRECT` no frontend do FireBot.

---

## 3. Smoke-test do `xbot-redirect` (gate — roda antes de promover)

```bash
# 1) resolve de um slug ATIVO real — tem que voltar 201 + url t.me/<bot>?start=rt_...
curl -s -X POST -H 'Content-Type: application/json' -H 'X-Forwarded-For: 200.155.1.9' \
  -d '{"ua":"Mozilla/5.0 (iPhone) Mobile","acceptLanguage":"pt-BR","utmSource":"FB","fbclid":"smoke"}' \
  http://127.0.0.1:3013/api/redirectors/resolve/<SLUG_ATIVO>

# 2) ramo alternative (sem fbclid, ua curl) — tem que voltar a alternativeUrl
curl -s -X POST -H 'Content-Type: application/json' -H 'X-Forwarded-For: 8.8.8.8' \
  -d '{"ua":"curl/8","acceptLanguage":"en"}' \
  http://127.0.0.1:3013/api/redirectors/resolve/<SLUG_ATIVO>

# 3) slug inexistente — {"url":"/","deviceFilter":"all"}
curl -s -X POST -H 'Content-Type: application/json' -d '{"ua":"x","acceptLanguage":"x"}' \
  http://127.0.0.1:3013/api/redirectors/resolve/zzznope

# 4) NÃO iniciou o scheduler de marketing (tem que estar SILENCIOSO):
docker logs xbot-redirect 2>&1 | grep -c MarketingScheduler   # → 0

# 5) health + subiu limpo:
curl -s http://127.0.0.1:3013/api/health
docker logs xbot-redirect 2>&1 | grep 'successfully started'
docker inspect --format '{{.State.Status}} r={{.RestartCount}}' xbot-redirect
```

Falhou qualquer um → `docker compose stop redirect`, aborta. O primário nunca foi tocado.

---

## 4. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| `xbot-redirect` sobe quebrado (falta provider, erro de boot) | É a MESMA image/AppModule do backend que já roda. Único onModuleInit tratado. Smoke-test pega antes de promover. Se cair, `route.ts` usa o `backend`. |
| `QUEUE_ROLE=redirect` processa job de fluxo por engano | `runsFlowQueues()`/`runsHeavyQueues()` retornam false → **nenhum `@Processor` é instanciado**. Confirmado no código de cada module (`...(runsHeavyQueues() ? [Processor] : [])`). |
| Rota de webhook exposta no `xbot-redirect` | Porta `127.0.0.1:3013` só. nginx nunca roteia pra lá. Frontend só chama `/api/redirectors/resolve`. |
| Pool Postgres: +10 conexões | `max_connections=200`, uso real ~30. Folga enorme. |
| Memória: +1 processo Node (~300–400MB base) | `mem_limit: 1g`. VPS tem 31GB, ~9GB livre. |
| throttle 30→240 deixa passar abuso | 240/min = 4 req/s por IP real. Uma pessoa não faz isso. Bot que faça, 4/s ainda é contido. |
| Deploy toca `queue-role.ts` (usado em todo lugar) | Mudança é `&& role !== 'redirect'` — aditiva, não altera api/worker/all. `tsc` + smoke-test dos webhooks pós-deploy. |

---

## 5. Arquivos tocados (Fase 1)

| Arquivo | Mudança | Onde patchar |
|---|---|---|
| `apps/backend/src/common/queue-role.ts` | +`&& role !== 'redirect'` ×2 | git (idêntico no XBot) |
| `apps/backend/src/modules/marketing/marketing-scheduler.service.ts` | import + `if (!runsHeavyQueues()) return` | git (verificar drift vs XBot) |
| `apps/backend/src/modules/redirectors/redirectors.controller.ts` | `@Throttle` 30→240 | **versão do XBot** (tem drift no service; controller confirmar) |
| `apps/frontend/src/app/r/[slug]/route.ts` | cadeia de fallback de 3 | **versão do XBot** (`app.xbot.solutions` hardcoded, difere do git) |
| `docker-compose.vps.yml` | +serviço `redirect`, +env no `frontend` | direto no `/opt/xbot/` |

Nenhuma migration. Nenhuma mudança de nginx.

Ver [[deploy-xbot-zero-downtime]] [[incidente-2026-09-04-payments-index]] [[redirect-latency-plano]].
