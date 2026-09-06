# Reverter o código do redirect (mantendo o container `xbot-redirect`)

> **Status:** só mapa, verificado commit a commit. **Nada revertido. Aguardando aprovação.**
> **Pedido:** voltar o **código** do `/r/` ao jeito de antes, **mantendo o container
> dedicado** `xbot-redirect`. Infra fica.

---

## 1. Auditoria completa — TUDO que mudou no caminho do redirect

Baseline = **`e3f1a24`** (01/09 — "sincroniza repo com produção", último estado estável,
é ~o que a FireBot roda hoje). Conferido `git log` de **cada arquivo** do caminho do
`/r/` desde 20/08. Estes são **todos** os commits que tocaram o caminho:

| id | arquivo | commit | data | o que mudou | já estava no "antes" (`scratchpad/backup-fase2/`)? |
|----|---------|--------|------|-------------|:--:|
| **R1** | `redirectors.service.ts` | `93b0227` | 01/09 | CAPI PageView: `handlePageView` (inline) → `enqueuePageView` (fila do worker), 2 pontos | ✅ sim |
| **R2** | `redirectors.service.ts` | `d578cf8` | 04/09 | `slugCache` (Map, TTL 15 s) + `loadRedirector` com `select` enxuto (era `include: flow.bot`) | ❌ não |
| **R3** | `redirectors.service.ts` | `d578cf8` | 04/09 | `resolve`: `Promise.all([loadRedirector, ipBlacklist.checkBlocked])` (era sequencial) | ❌ não |
| **R4** | `redirectors.service.ts` | `d578cf8`+`831f028` | 04/09 | `findAll`/`findOne`/`update`: contadores calculados na leitura via `clickCounts` (`groupBy`) | ❌ não |
| **R5** | `redirectors.service.ts` | `831f028` | 04/09 | `saveTracking` fire-and-forget + `trackingId = randomUUID()` no app (era `await`, id do banco) | ❌ não |
| **R6** | `redirectors.service.ts` | `831f028` | 04/09 | deep link sempre `rt_`; removido o fallback `rf_<slug>` | ❌ não |
| **R7** | `redirectors.service.ts` | `831f028` | 04/09 | `logClick`: removido `redirector.update({ totalClicks: { increment } })` (contador denormalizado) | ❌ não |
| **P1** | `platform-settings.service.ts` | `d578cf8` | 04/09 | `tgDomainCache` (TTL 60 s) em `getTelegramLinkDomain` | ❌ não |
| **C1** | `redirectors.controller.ts` | `8c16e25` | 04/09 | `@Throttle` do `resolve` **30 → 240** /min por IP | ❌ não |
| **Q1** | `queue-role.ts` | `d62ac91` | 01/09 | arquivo **criado** (split api/worker) | n/a |
| **Q2** | `queue-role.ts` | `8c16e25` | 04/09 | adiciona o role **`redirect`** (`&& role !== 'redirect'` nas 2 funções) | ⚠️ **manter** |
| **T1** | `route.ts` | `5da3ed2` | 02/09 | fetch único → `primaryUrl` + `fallbackUrl` (standby), helper `tryResolve` (2 hops) | ❌ não |
| **T2** | `route.ts` | `8c16e25` | 04/09 | adiciona `redirect:3001` como 1º hop (3 hops), timeout 2,5 s | ⚠️ **manter** |
| **S1** | `schema.prisma` | `831f028` | 04/09 | `@@index([redirectorId, destination])` em `RedirectorClick` | n/a (índice; XBot e FireBot já têm) |

### O que **NÃO** mudou (conferido — fora de todos os diffs)

- **`evaluateRules(rules, ctx, verificationCode)`** — a lógica de cloaking. Idêntica.
- O cálculo de `deviceFilter` e o `if (matched && redirector.flow?.bot?.username)`.
- O HTML servido ao crawler: `buildScraperHtml` / `buildRedirectHtml` / o gate
  `deviceFilter === 'mobile_only'` no `route.ts`.
- O decoder do `/start` (`webhooks.service.ts`) — **continua aceitando `rt_` E `rf_`**
  (linha 308, "Formato legado"). Reverter R6 é 100 % seguro.
- `redirectors.module.ts`, `ip-blacklist.service.ts`, `create-redirector.dto.ts`
  (último toque em `e3f1a24`).

**Confirmado: a lista acima é completa.** O que a Meta enxerga no `/r/{slug}` não
mudou em nenhum commit — só encanamento (cache, fila, contador, fallback, throttle).

---

## 2. Plano de revert — item por item

### ⛔ Nunca reverter

| id | motivo |
|----|--------|
| **Q2** (`queue-role.ts` role `redirect`) | o container sobe com `QUEUE_ROLE=redirect`. Sem o role → `runsHeavyQueues()` retorna `true` → o `xbot-redirect` liga **todos** os `@Processor` e vira um **worker fantasma** (remarketing/mensagens duplicados). |
| **T2** (route.ts manda pro `redirect:3001` primeiro) | sem isso, o tráfego não passa mais pelo container — o container fica inútil. Ver opção A/B abaixo. |

### 🔁 Reverter — cada um com seu efeito e risco

| id | reverter para | afeta reprovação de anúncio? | risco de reverter |
|----|---------------|------------------------------|-------------------|
| **R2** (cache 15 s do slug) | `findUnique` fresco a cada `resolve` | **É o único que pode.** Janela de 15 s servindo decisão velha logo após o anunciante editar a URL segura / regras pra consertar um anúncio | nenhum |
| **R3** (IP-check paralelo) | sequencial | não | nenhum (só ~2 ms mais lento) |
| **R2b** (select enxuto) | `include: { flow: { include: { bot: true } } }` | não | resolve volta de ~7 ms → ~300 ms (carrega o JSON gordo do `Flow`) |
| **R5** (saveTracking async) | `await this.saveTracking()` (id do banco) | não | sob carga: se o INSERT atrasar/falhar, o `/start` recebe trackingId sem linha → perde atribuição de UTM. Reverter = atribuição mais firme, +~10–20 ms |
| **R6** (`rf_` fallback) | volta o `rf_<slug>` quando `saveTracking` falha | não | nenhum (decoder aceita) |
| **R4 + R7** (contador na leitura) | `redirector.update({ totalClicks: { increment } })` por clique | não | **⚠️ REABRE o gargalo do incidente de 04/09** — `UPDATE` na MESMA linha `Redirector` a cada clique → row-lock serializa sob volume alto. **Índice não resolve** (lock write-write). |
| **P1** (cache 60 s do domínio) | `getSettings()` a cada chamada | não | +1 query por clique |
| **C1** (throttle 30) | `@Throttle({ limit: 30 })` | **manter 240 AJUDA** — 30/min por IP → 429 no crawler da Meta atrás de CGNAT = "destino indisponível" = reprova | reverter **pode piorar** a reprovação |
| **T1** (route.ts 3→1 hop) | ver opção A/B | não | — |
| **R1** (`enqueuePageView`) | `handlePageView` inline (`e3f1a24`) | **não** (evento server-side fire-and-forget dos dois jeitos; crawler nunca vê) | inline volta a pesar o event loop do backend a ~100 resolves/min |

### route.ts — opção A ou B (T1/T2)

| | |
|---|---|
| **A (recomendada)** | **manter o `route.ts` atual.** Já roteia pro container e cai no backend se ele sair. O bloco de HTML/cloaking é idêntico a todas as versões. |
| **B ("revert puro")** | voltar ao fetch único do `e3f1a24` e setar `API_URL_INTERNAL=http://redirect:3001` no env do serviço `frontend` → primário = container. Perde o fallback pro backend se o container cair. |

---

## 3. Três níveis de revert — escolher um

| nível | reverte | mantém | risco |
|-------|---------|--------|-------|
| **Mínimo** (endereça a hipótese) | **R2** (cache 15 s) só | todo o resto | **zero** |
| **Conservador** | R2, R2b, R3, R5, R6, P1, T1(opção B) | **R1, R4+R7 (contador), C1 (240), Q2** | baixo — sem outage, throttle protegido |
| **Exato como `e3f1a24`** | R1, R2, R2b, R3, R4, R5, R6, R7, P1, C1, T1 | **só Q2 + route.ts apontando pro container** | **⚠️ reabre o outage de 04/09 (R4+R7); throttle 30 pode piorar reprovação (C1)** |

**Recomendação:** nível **Conservador**. Se a teoria é "cache de 15 s serve página
velha pro crawler", o nível **Mínimo** já resolve e não mexe em mais nada.

---

## 4. Como aplicar (quando aprovar)

**No git:**
- `git revert --no-commit d578cf8 831f028` → resolver conflitos.
- Se nível Conservador: **re-aplicar** `clickCounts` + os merges em
  `findAll`/`findOne`/`update` (manter R4+R7), e **não** mexer no `redirectors.controller.ts` (C1).
- **Não** reverter `8c16e25` inteiro — manter `queue-role.ts` (Q2) e o route.ts do container (T2).
- Nível Mínimo: só editar `loadRedirector` pra tirar as 4 linhas do `slugCache`.

**No XBot (deployado — tem drift, ≠ git):**
- `redirectors.service.ts` deployado não tem o ramo `external`. Restaurar de
  `scratchpad/backup-fase2/redirectors.service.ts.DEPLOYED` (+ re-aplicar contador na
  leitura se nível Conservador).
- `platform-settings.service.ts` → restaurar de `scratchpad/backup-fase2/`.
- Rebuild `xbot-backend:latest` → recriar `backend` + `worker` + `redirect` (mesma imagem).
  O `xbot-redirect` continua no ar. Rollback: imagem `xbot-backend:pre-fase2` (já existe).

**FireBot:** o deploy pendente pega a versão já revertida do git — sem problema.
