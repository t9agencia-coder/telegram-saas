# Otimização de latência do redirect (`/r/[slug]`) — plano mapeado

> **Status:** mapeado, **não aplicado**. Aprovado pelo dono para fazer "futuramente".
> Levantado em 2026-09-03 durante pico de vendas do XBot.
> Instância alvo: **XBot** (deploy por tarball; `redirectors.service.ts` do XBot é
> **diferente do git** — sem o ramo `external`, por causa do drift de schema
> `Redirector.destinationType`/`externalUrl` que nunca foi pro XBot).

---

## 1. Diagnóstico (medições reais)

Fluxo do redirect:
`cliente → nginx (TLS) → xbot-frontend (Next route `app/r/[slug]/route.ts`) → POST http://backend:3001/api/redirectors/resolve/:slug → monta HTML → devolve`

| Trecho | Tempo medido |
|---|---|
| `/r/` ponta-a-ponta (TTFB) | **~350 ms** (p95 ~520 ms, cauda a 800 ms) |
| nginx + TLS | ~40 ms |
| Next.js route handler (fetch + build HTML) | ~10–12 ms (medido com slug inexistente: 12 ms) |
| **backend `resolve`** | **~300 ms** ← o gargalo |
| asset estático servido pelo Next | 3–5 ms |
| `/api/health` (mesmo pipeline, sem DB) | **2 ms** |

**O `resolve` leva ~300 ms até no `xbot-backend-standby`** (que não recebe tráfego
nenhum) → não é carga, não é event loop, não é contenção de pool.

**O SQL não é o problema** — `EXPLAIN ANALYZE` de cada query do `resolve`:

| Query | Execution Time |
|---|---|
| `Redirector` por slug (`Redirector_slug_key`) | 0,25 ms |
| `IpBlacklist` por ip (`IpBlacklist_ip_key`) | 0,14 ms |
| `Flow` por id (`Flow_pkey`) | 0,14 ms |
| `TelegramBot` por id | 0,37 ms |
| `PlatformSettings` (seq scan, 1 linha) | 0,08 ms |
| **Soma** | **< 1 ms** |

Conclusão: os ~295 ms restantes são **overhead do Prisma em ~6 queries feitas em
SÉRIE** (client → query engine → pool → postgres → volta, por query), agravado por
**puxar a linha inteira do `Flow`** via `include` (colunas `nodes`/`edges`/`config`
= JSON do construtor de fluxo; a tabela `Flow` tem **623 MB em 26 linhas**).

### Perdas de cliente hoje (à parte da latência)

- `/r/` no dia: **35.645 hits**, **98%+ = HTTP 200**.
- Não-200 quase tudo `facebookexternalhit` (301/307 — robô da Meta pré-carregando o link, **não é cliente**).
- **502: 23 no dia (0,065%)** — todos em **rajadas nos momentos de deploy** (recriar o container `xbot-frontend`, que **não tem blue-green**). Entre deploys: zero.
- **499: 61 (0,17%)** — usuário fechou a aba antes de carregar. Normal.
- Conversão (3h de amostra): **4.362 visitantes únicos → 1.471 abriram o bot (~34%)**. Queda normal de funil pra tráfego frio de FB — não é falha técnica.
- Sem `limit_req` no `/r/`. O `@Throttle(30/min)` do `resolve` é **por IP real do visitante** (via `SmartThrottlerGuard` que lê `req.body.ip` que o `route.ts` preenche do `X-Forwarded-For`) → não derruba usuário real em produção.

---

## 2. As 3 otimizações aprovadas (#1, #2, #3) — sem mudança de comportamento

Ganho esperado: `resolve` ~300 ms → **~40–80 ms**; `/r/` ~350 ms → **~100–130 ms**.

### Arquivo A — `apps/backend/src/modules/redirectors/redirectors.service.ts`

> ⚠️ Editar a versão **do XBot** (puxar de `/opt/xbot/...` antes), não o git.
> As chamadas Prisma no `resolve` são `prismaAny(this.prisma)` (cast `any`) →
> **o TS não valida o `select`**; erro só aparece em runtime. Por isso o
> **gate de smoke-test no standby** (seção 4) é obrigatório.

#### Método `resolve()` — ANTES (como está no XBot hoje)

```ts
async resolve(slug: string, ctx: ResolveRedirectorDto) {
  const redirector = await prismaAny(this.prisma).redirector.findUnique({
    where: { slug },
    include: { flow: { include: { bot: true } } },
  });

  if (!redirector || !redirector.isActive) {
    return { url: redirector?.alternativeUrl || '/', deviceFilter: 'all' };
  }

  const blockCheck = await this.ipBlacklist.checkBlocked(ctx.ip);
  if (blockCheck.blocked) {
    this.logBlockedClick(redirector.id, ctx, blockCheck.telegramId).catch(() => {});
    return { url: redirector.alternativeUrl || '/', deviceFilter: 'all' };
  }

  const rules = (redirector.rules as any) || {};
  const devices: string[] = rules.devices || [];
  const deviceFilter: string = (rules.deviceFilter as string) ||
    (devices.includes('mobile') && !devices.includes('desktop') ? 'mobile_only' : 'all');

  const matched = this.evaluateRules(rules, ctx, redirector.verificationCode);

  const appBase = (process.env.FRONTEND_URL || 'https://app.xbot.solutions')
    .replace('http://localhost:3000', 'https://app.xbot.solutions');
  const sourceUrl = `${appBase}/r/${redirector.slug}`;

  let destination: 'telegram' | 'alternative';
  let url: string;

  if (matched && redirector.flow?.bot?.username) {
    destination = 'telegram';

    const trackingId = await this.saveTracking(ctx, sourceUrl);
    const startParam = trackingId
      ? `rt_${Buffer.from(`${redirector.slug}:${trackingId}`).toString('base64url')}`
      : `rf_${redirector.slug}`;

    const utmParams = new URLSearchParams();
    if (ctx.utmSource)   utmParams.set('utm_source',   ctx.utmSource);
    if (ctx.utmMedium)   utmParams.set('utm_medium',   ctx.utmMedium);
    if (ctx.utmCampaign) utmParams.set('utm_campaign', ctx.utmCampaign);
    if (ctx.utmContent)  utmParams.set('utm_content',  ctx.utmContent);
    if (ctx.utmTerm)     utmParams.set('utm_term',     ctx.utmTerm);
    const utmStr = utmParams.toString();

    const telegramDomain = await this.platformSettings.getTelegramLinkDomain();
    const base = `https://${telegramDomain}/${redirector.flow.bot.username}?start=${startParam}`;
    url = utmStr ? `${base}&${utmStr}` : base;

    this.facebookCapi.enqueuePageView(redirector.workspaceId, {
      ip: ctx.ip, userAgent: ctx.ua, fbp: ctx.fbp, fbc: ctx.fbc, sourceUrl,
      botId: redirector.flow?.bot?.id,
      utmSource: ctx.utmSource, utmMedium: ctx.utmMedium, utmCampaign: ctx.utmCampaign,
      utmContent: ctx.utmContent, utmTerm: ctx.utmTerm,
    });
  } else {
    destination = 'alternative';
    url = redirector.alternativeUrl || '/';
    this.saveTracking(ctx, sourceUrl).catch(() => {});
  }

  this.logClick(redirector.id, destination, ctx).catch(() => {});

  return { url, deviceFilter, alternativeUrl: redirector.alternativeUrl };
}
```

#### Método `resolve()` — DEPOIS (#1 + #2)

```ts
async resolve(slug: string, ctx: ResolveRedirectorDto) {
  // #2: redirector + checagem de IP em paralelo (independentes).
  // #1: select enxuto — não traz Flow.nodes/edges/config nem campos do bot que
  //     não usamos. Antes o `include` puxava a linha inteira do Flow (JSON grande).
  const [redirector, blockCheck] = await Promise.all([
    prismaAny(this.prisma).redirector.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        isActive: true,
        alternativeUrl: true,
        rules: true,
        verificationCode: true,
        workspaceId: true,
        flow: { select: { bot: { select: { id: true, username: true } } } },
      },
    }),
    this.ipBlacklist.checkBlocked(ctx.ip),
  ]);

  if (!redirector || !redirector.isActive) {
    return { url: redirector?.alternativeUrl || '/', deviceFilter: 'all' };
  }

  if (blockCheck.blocked) {
    this.logBlockedClick(redirector.id, ctx, blockCheck.telegramId).catch(() => {});
    return { url: redirector.alternativeUrl || '/', deviceFilter: 'all' };
  }

  const rules = (redirector.rules as any) || {};
  const devices: string[] = rules.devices || [];
  const deviceFilter: string = (rules.deviceFilter as string) ||
    (devices.includes('mobile') && !devices.includes('desktop') ? 'mobile_only' : 'all');

  const matched = this.evaluateRules(rules, ctx, redirector.verificationCode);

  const appBase = (process.env.FRONTEND_URL || 'https://app.xbot.solutions')
    .replace('http://localhost:3000', 'https://app.xbot.solutions');
  const sourceUrl = `${appBase}/r/${redirector.slug}`;

  let destination: 'telegram' | 'alternative';
  let url: string;

  if (matched && redirector.flow?.bot?.username) {
    destination = 'telegram';

    // #2: grava o tracking e lê o domínio do Telegram em paralelo
    //     (getTelegramLinkDomain agora é cacheado — #3 — então isso é ~instantâneo).
    const [trackingId, telegramDomain] = await Promise.all([
      this.saveTracking(ctx, sourceUrl),
      this.platformSettings.getTelegramLinkDomain(),
    ]);
    const startParam = trackingId
      ? `rt_${Buffer.from(`${redirector.slug}:${trackingId}`).toString('base64url')}`
      : `rf_${redirector.slug}`;

    const utmParams = new URLSearchParams();
    if (ctx.utmSource)   utmParams.set('utm_source',   ctx.utmSource);
    if (ctx.utmMedium)   utmParams.set('utm_medium',   ctx.utmMedium);
    if (ctx.utmCampaign) utmParams.set('utm_campaign', ctx.utmCampaign);
    if (ctx.utmContent)  utmParams.set('utm_content',  ctx.utmContent);
    if (ctx.utmTerm)     utmParams.set('utm_term',     ctx.utmTerm);
    const utmStr = utmParams.toString();

    const base = `https://${telegramDomain}/${redirector.flow.bot.username}?start=${startParam}`;
    url = utmStr ? `${base}&${utmStr}` : base;

    this.facebookCapi.enqueuePageView(redirector.workspaceId, {
      ip: ctx.ip, userAgent: ctx.ua, fbp: ctx.fbp, fbc: ctx.fbc, sourceUrl,
      botId: redirector.flow?.bot?.id,
      utmSource: ctx.utmSource, utmMedium: ctx.utmMedium, utmCampaign: ctx.utmCampaign,
      utmContent: ctx.utmContent, utmTerm: ctx.utmTerm,
    });
  } else {
    destination = 'alternative';
    url = redirector.alternativeUrl || '/';
    this.saveTracking(ctx, sourceUrl).catch(() => {});
  }

  this.logClick(redirector.id, destination, ctx).catch(() => {});

  return { url, deviceFilter, alternativeUrl: redirector.alternativeUrl };
}
```

#### Prova de que o `select` cobre tudo

Todos os acessos a `redirector.*` no método (15 ocorrências):

| Campo | Onde é usado |
|---|---|
| `isActive` | guarda inicial |
| `alternativeUrl` | 4 returns |
| `id` | `logBlockedClick`, `logClick` (por parâmetro) |
| `rules` | `deviceFilter`, `evaluateRules` |
| `verificationCode` | `evaluateRules` |
| `slug` | `sourceUrl`, `startParam` (rt_/rf_) |
| `workspaceId` | `enqueuePageView` |
| `flow.bot.username` | condição do ramo + URL do Telegram |
| `flow.bot.id` | `enqueuePageView` (`botId`) |

`logClick` faz `db.redirector.update({ where: { id: redirectorId } })` — query própria,
não precisa do objeto. `evaluateRules` recebe `rules` e `verificationCode` por argumento.

#### Riscos e por que são nulos

- **`select` esquecer um campo** → campo vira `undefined`. Mitigado: tabela acima
  enumera os 9 acessos; nada mais é lido.
- **`flow` ou `bot` nulos** → `redirector.flow?.bot?.username` (optional chaining, já
  existe) → cai no ramo `alternative`. Mesma semântica do `include`.
- **`checkBlocked` roda mesmo com slug inexistente** (~0,06% do tráfego) → é
  `findUnique` indexado sem efeito colateral. Se lançar (DB fora), o `Promise.all`
  rejeita = mesmo resultado de hoje (500 → `route.ts` redireciona pra `/`).
- **`saveTracking` / `getTelegramLinkDomain` no `Promise.all`** → ambos têm
  try/catch interno e **nunca lançam** (retornam `null` / `'t.me'`). `Promise.all`
  nunca rejeita nesse ponto.
- Ordem dos returns, ramos, `enqueuePageView`, `logClick`, formato de retorno:
  **idênticos**.

### Arquivo B — `apps/backend/src/modules/settings/platform-settings.service.ts`

> Este arquivo é **idêntico** no XBot e no git. Pode editar no git e deployar.

**#3 — cache em memória do `getTelegramLinkDomain()` (TTL 60s) + limpa no set.**

```ts
export class PlatformSettingsService {
  // ...
  private tgDomainCache: { value: string; at: number } | null = null;
  private static readonly TG_DOMAIN_TTL_MS = 60_000;

  async getTelegramLinkDomain(): Promise<string> {
    const c = this.tgDomainCache;
    if (c && Date.now() - c.at < PlatformSettingsService.TG_DOMAIN_TTL_MS) {
      return c.value;
    }
    try {
      const cfg = await this.getSettings();
      const value = cfg.telegramLinkDomain || 't.me';
      this.tgDomainCache = { value, at: Date.now() };
      return value;
    } catch {
      return this.tgDomainCache?.value || 't.me';
    }
  }

  async setTelegramLinkDomain(domain: string) {
    if (!VALID_TELEGRAM_DOMAINS.includes(domain as TelegramLinkDomain)) {
      throw new BadRequestException(`Domínio inválido. Use um de: ${VALID_TELEGRAM_DOMAINS.join(', ')}`);
    }
    const res = await this.prisma.platformSettings.upsert({
      where:  { id: PLATFORM_SETTINGS_ID },
      create: { id: PLATFORM_SETTINGS_ID, telegramLinkDomain: domain },
      update: { telegramLinkDomain: domain },
    });
    this.tgDomainCache = { value: domain, at: Date.now() }; // #3: mantém fresco após troca manual
    return res;
  }
}
```

#### Riscos e por que são nulos

- **Defasagem**: até 60s usando o valor antigo em processos que não fizeram o `set`
  (`xbot-backend-standby`, workers). O valor é `t.me` **ou** `telegram.me` — **os dois
  abrem o Telegram**. Nunca foi trocado em produção. Impacto real: zero.
- `getSettings()`, `getPixDefaultProductName()`, `getOrCreateVapidKeys()` — **não
  são tocados**. O cache é campo privado novo, só lido/escrito em `getTelegramLinkDomain`
  e `setTelegramLinkDomain`.
- Tipo de retorno do `set` continua `Promise<PlatformSettings>` (await + return da
  mesma coisa).

### `route.ts` do frontend — **NÃO muda nesta fase** (isso é o #5 abaixo).

---

## 3. Deploy (quando for fazer)

- **Só backend**: `docker compose build backend` → recria `xbot-backend-standby`
  (espera healthy 3012) → **smoke-test no standby** (seção 4) → recria `xbot-backend`
  (nginx faz failover pro standby na janela). Ver [[deploy-xbot-zero-downtime]].
- **Workers NÃO são recriados** — `RedirectorsService` só é usado por
  `PublicRedirectorsController` / `RedirectorsController` (API). Nenhum `@Processor`
  importa. `PlatformSettingsService` roda em worker só via `getOrCreateVapidKeys`
  (`push-delivery.processor`), método não tocado.
- `BASE` do script de deploy: commitar as mudanças primeiro, `BASE` = commit anterior.
- `redirectors.service.ts`: **puxar a versão do XBot, patchar, subir** — nunca o git HEAD
  (git tem o ramo `external` + `KwaiAdsService` que o XBot não tem → quebraria).

## 4. Gate de segurança obrigatório (smoke-test no standby)

Depois de recriar o `xbot-backend-standby` e ANTES de tocar no primário:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 200.155.1.9' \
  -d '{"ua":"Mozilla/5.0 (iPhone) Mobile","acceptLanguage":"pt-BR","utmSource":"FB","fbclid":"smoke"}' \
  http://127.0.0.1:3012/api/redirectors/resolve/<UM_SLUG_ATIVO_REAL>
```

Tem que voltar **HTTP 201** com body tipo:
```json
{"url":"https://t.me/<bot>?start=rt_<base64>&utm_source=FB","deviceFilter":"mobile_only","alternativeUrl":"..."}
```

Se voltar 500 / `url` sem `t.me` / `start` vazio → **abortar**, reverter o standby,
**não promover**. O primário nunca foi tocado.

Testar também o ramo `alternative` (sem `fbclid`/`utm`, `ua: "curl"`) e um slug
inexistente (tem que devolver `{"url":"/","deviceFilter":"all"}` ou o alternativeUrl).

## 5. Medir depois

`log_min_duration_statement = 0` no postgres por ~10s, disparar uns resolves no
standby, conferir no log do container `xbot-postgres` quantas queries o `resolve`
faz e a soma das durations. Alvo: `resolve` < 80 ms no `curl -w %{time_total}`.
**Restaurar `log_min_duration_statement = 500` depois.**

---

## 6. Otimizações NÃO incluídas (fases futuras)

| # | Mudança | Ganho | Risco |
|---|---|---|---|
| 4 | **Tirar o INSERT do `UserTracking` do caminho crítico** — gerar o `trackingId` (`crypto.randomUUID()`) no app, montar o deep link na hora, gravar o `UserTracking` com esse id em fire-and-forget. O bot só resolve o `rt_` segundos depois (usuário abrindo o Telegram) — o INSERT (<5 ms) termina muito antes. | alto (tira o último `await` de escrita) | médio — precisa garantir que o id gravado bate com o do link; e o `catch` do insert não pode engolir silenciosamente um lead |
| 5 | **keep-alive no `fetch` do `route.ts` → backend** (undici `Agent` compartilhado com `keepAlive`), em vez de TCP+handshake por request. | ~5–15 ms | baixo |
| 6 | **blue-green no `xbot-frontend`** (ou 2 réplicas no upstream nginx, igual ao backend) — elimina os 502 nos deploys, que é a única perda real de cliente no redirect. | mata ~0,065% de perda nos deploys | baixo (infra) |
| 7 | **Mover o `/r/` inteiro pro backend** (Nest serve o HTML) e apontar o nginx `/r/` direto pro `xbot_api`. Remove o hop do Next.js **e** ganha blue-green de graça. | alto | alto (reescrita do caminho) |

## 7. Contexto que não pode quebrar

- XBot com **tráfego de cliente ao vivo** — deploy sempre blue-green, imperceptível.
- **Não quebrar nenhuma função existente** — cloaker, logClick, saveTracking, CAPI,
  deep link `rt_`/`rf_`, métricas `totalClicks`/`telegramClicks`/`alternativeClicks`.
- Só **otimizar a entrega** — mesmos dados gravados, mesmo comportamento visível.
- Ver [[modulo-marketing]], [[git-sync-producao]], [[plano-estabilizacao-vps]].
