# Mapa das alterações desta rodada — e o que "voltar como estava" significa (XBot)

> **Status:** só mapeamento. Nada revertido. Decisão pendente.
> **Sintoma relatado:** "depois das atualizações ficou rejeitando muitos anúncios."
> **Escopo do que se cogita reverter:** só código. Infra (containers, nginx,
> índices do Postgres, blue-green) **fica**.

---

## 1. Linha do tempo dos deploys no XBot

| Data | Deploy | O que entrou |
|------|--------|--------------|
| **02/09** | Módulo Tracking Fase 1–2b (`8235aec` … `44b3e13`) | App Meta + OAuth + **sync automático da Marketing API a cada 15 min** em todas as contas selecionadas; multi-perfil (até 5) + até 20 contas de anúncio; ativar/pausar campanha via Meta; Visão Geral financeira; atribuição de vendas (lê `Payment` local). `badf451`: tira o rate-limit global dos callbacks (Telegram/PIX/UTMify). |
| **03/09** | Duplicação + funil + taxa (`c86eb26` … `3122861`) | **Duplicar campanha na Meta** (`POST /{id}/copies`, deep copy, até 30 cópias/clique) na linha e na barra de seleção em massa; etapa "Page view" no funil; Taxa Meta Ads BR + Internacional. |
| **03/09 17:52** | — | **Meta bloqueia o acesso à API do App** ("API access blocked"). Não foi causado por deploy nosso desse horário — é ação do lado da Meta. |
| **04/09** | Redirect isolado + Fase 2/2.5 + sync sob demanda (`8c16e25` … `ec5d25c`) | Container `xbot-redirect` dedicado; `/r/` mais barato (select enxuto, cache 15 s, paralelo, contador fora do caminho quente); **sync da Meta deixa de ser periódico — só no botão "Atualizar"**. Incidente de banco do dia 04 (índices faltando na `Lead`) corrigido com `CREATE INDEX CONCURRENTLY`. |

---

## 2. Resumo — cada mudança e a relação com rejeição de anúncio

| # | Mudança | Bucket | Pode causar rejeição de anúncio? | Reverter o código |
|---|---------|--------|-------------------------------|-------------------|
| A1 | **Sync automático da Marketing API a cada 15 min** (Fase 1) | Meta API | **Plausível** — App novo (tier limitado) fazendo ~15–23 mil chamadas/dia em ~20 contas. Padrão clássico de "app jovem batendo demais" → Meta restringe o App → rejeições/limitações em cascata nas contas ligadas. | Já foi 90% revertido em `ec5d25c` (agora é sob demanda). Reverter *de novo* pro modelo antigo seria **piorar**. |
| A2 | **Duplicar campanha** (`POST /{id}/copies`, deep copy, até 30/clique) | Meta API | **O candidato mais direto.** A Meta dá escrutínio de revisão bem mais pesado a campanha/conjunto/anúncio **duplicado em lote** — ainda mais cópia de cópia com `deep_copy`. Se o cliente passou a duplicar em vez de criar no Gerenciador, sozinho explica um pico de reprovação. | Remover os botões "Duplicar" (linha + massa) e a rota. Volta a criar campanha no Gerenciador da Meta. **Baixo risco, reversível.** |
| A3 | **Ativar/pausar campanha em massa** via Meta (`98737de`, `7ae81a6`) | Meta API | Baixo. Escreve `status` via `POST /{id}`; teto de 2000. Muito volume de escrita em pouco tempo *contribui* pro perfil de abuso do App, mas não reprova criativo por si. | Remover a ação em massa; manter/ban o toggle individual. |
| B1 | **Container `xbot-redirect` dedicado** (`8c16e25`) | **Infra** | Não. É onde o `/r/` roda. | **Não é código — fica.** |
| B2 | **`/r/` — cadeia de fallback no `route.ts`** (redirect→backend→standby) | Redirect | Não. Só muda *qual instância* responde; a resposta é idêntica. | Reverter pro fetch único. Ver §4 — **pegadinha com a infra que fica**. |
| B3 | **`resolve()` mais barato** (`d578cf8`): `select` enxuto + cache 15 s + IP-check em paralelo | Redirect | **Não.** A decisão de cloaking (`evaluateRules(rules, ctx, verificationCode)`, `deviceFilter`, `matched && bot.username`) é **byte a byte igual** — conferido linha a linha. O que a Meta vê no `/r/{slug}` não mudou. Único efeito externo: até 15 s de defasagem quando o cliente edita as regras / a URL segura. | Reverter pro `findUnique` com `include` a cada request. Reabre o risco de banco do incidente de 04/09. |
| B4 | **Contador fora do caminho quente + `saveTracking` fire-and-forget + `randomUUID`** (`831f028`) | Redirect | Não afeta o que a Meta vê. **Efeito colateral real:** sob carga, se o `INSERT` do `UserTracking` falhar, aquele lead perde a atribuição de UTM (o bot funciona igual). | Reverter pro `await saveTracking` + `UPDATE ... increment` a cada clique. Reabre o lock de linha do incidente de 04/09. |
| B5 | **`@Throttle` do `resolve` 30 → 240/min por IP** (`8c16e25`) | Redirect | **Protetivo.** Com 30/min, um CGNAT de operadora (ou o próprio crawler da Meta) tomava 429 → destino "quebrado" → **mais chance de reprovar**. Subir pra 240 ajuda. | **Não reverter.** |
| B6 | **`referer` capturado no `/r/`** (`route.ts`) | Redirect | Não. Comentário no código: usado só pra classificar origem do tráfego na aba Filtro; **nunca entra na decisão de redirect.** | Trivial de tirar; sem efeito. |
| B7 | **Kwai: desempacota `utm_content` `ad_id::click_id::pixel_id`** | Redirect | Não. Só parsing de parâmetro de campanha Kwai. Não muda Facebook. | Trivial de tirar. |
| C1 | **Etapa "Page view" no funil** (`c86eb26`) | Relatório | **Não.** Lê `RedirectorClick` do banco e desenha uma barra a mais. | Sem motivo pra reverter. |
| C2 | **Taxa Meta Ads BR + Internacional** (`d5b294d`, `3122861`) | Relatório | **Não.** Cálculo de % sobre gasto no dashboard. Zero contato com a Meta. | Sem motivo pra reverter. |
| C3 | **Remove sync periódico da Meta** (`ec5d25c`) | Meta API | **Reduz** rejeição-risco (menos chamada). Efeito colateral: status de campanha no painel pode ficar velho até apertar "Atualizar". | Reverter = voltar o ciclo de 15 min = **de novo o A1**. Não fazer. |

---

## 3. Detalhe por bucket

### Bucket A — Meta / Marketing API  → **aqui está o candidato**

**A hipótese que fecha com o sintoma e com a data:**

1. **02/09** subiu um App Meta **novo** que passou a puxar a Marketing API **de 15 em 15 min** em ~11–24 contas de anúncio. Cada ciclo por conta =
   `getCampaigns` + `getAdSets` + `getAds` (paginado, `limit=200`) + `getAdAccount` + `getInsights` (3 dias, por anúncio/dia). Ordem de **~15–23 mil chamadas/dia**, num App ainda em tier limitado.
2. **03/09** entrou **duplicação de campanha** (`POST /{id}/copies` com `deep_copy`, rajada de até 30 por clique) + ativar/pausar em massa — carga de **escrita** em rajada.
3. **03/09 17:52** a Meta **bloqueou o acesso à API do App**.

App/Business sinalizado pela Meta → é comum vir junto **revisão mais dura / reprovação nas contas ligadas àquele Business**. Ou seja: pode não ser um arquivo nosso "mostrando coisa errada" — pode ser o **perfil de uso do App** (volume + duplicação) que queimou o App, e a reprovação de anúncio ser efeito colateral.

**O que "voltar como estava, só código" faz aqui:**

- **A2 (duplicação)** — remoção limpa e reversível:
  - back: `meta-ads.service.ts` (`copyCampaign`), `meta-campaign-ops.service.ts` (`enqueueDuplicate*`, `duplicateOnce`, `dupJobs`, `sanitizeDup`), `meta-ops.processor.ts` (branch `campaign-duplicate`), `marketing.controller.ts` (`POST campaigns/:id/duplicate` e `campaigns/bulk-duplicate`), `marketing.constants.ts` (`MKT_DUPLICATE_MAX`).
  - front: `dashboard/tracking/campanhas/page.tsx` (botão da linha, botão da barra de massa, `DuplicateCampaignModal`, `afterDuplicate`).
  - Commits: `4a12efd` + `cbfc4d5`. `git revert 4a12efd cbfc4d5` aplica quase limpo (só `marketing.controller.ts` e `campanhas/page.tsx` foram mexidos depois em `3122861` — resolver à mão).
- **A1/C3 (sync periódico)** — **não reverter.** Já está sob demanda (`ec5d25c`), que é o estado mais seguro. Voltar o ciclo de 15 min é reintroduzir exatamente a carga que provavelmente queimou o App.
- **A3 (ativar/pausar em massa)** — opcional. Se quiser minimizar escrita no App enquanto ele está sob análise: esconder a ação em massa, manter o toggle individual.

> **Antes de reverter qualquer coisa de código:** confirmar no painel do App
> (developers.facebook.com → o App → Alertas / App Review / Marketing API →
> "Usage & Rate Limits") **por que** o acesso foi bloqueado. Se o motivo for
> volume de chamadas ou automação não aprovada, o conserto é **parar a automação
> de escrita** (A2, e talvez A3) — não mexer no redirect.

### Bucket B — Redirect / cloaker  → **não é a causa; reverter tem custo**

Comparação feita **linha a linha** entre a versão do XBot de antes (`scratchpad/backup-fase2/redirectors.service.ts.DEPLOYED`) e a de agora (`scratchpad/xbot-f25/redirectors.service.ts`):

- **A decisão continua idêntica.** `evaluateRules(rules, ctx, redirector.verificationCode)`, o cálculo de `deviceFilter`, o `if (matched && redirector.flow?.bot?.username)`, o `verificationCode` (`?app=`) — nada disso foi tocado. A função `evaluateRules` **não** aparece em nenhum diff da sessão.
- **O HTML servido ao crawler não mudou.** `buildScraperHtml` / `buildRedirectHtml` / o gate `deviceFilter === 'mobile_only'` no `route.ts` são anteriores a esta sessão.
- O que mudou é **plumbing de performance**: de onde o `/r/` busca (`redirect:3001` → `backend` → `standby`), cache de 15 s do slug, checagem de IP em paralelo, contador calculado na leitura em vez de `UPDATE` por clique, `saveTracking` em segundo plano.

**Conclusão:** reverter o redirect **não muda o que a Meta enxerga** e **reabre** o gargalo de banco que derrubou o XBot em 04/09 (lock de linha no contador + `include` gordo do `Flow` no caminho quente).

### Bucket C — Relatórios  → **irrelevante pra rejeição**

Funil "Page view" e Taxa Meta BR/Internacional são cálculo/render no dashboard, em cima de dados que já estão no banco. Nenhuma chamada à Meta, nada servido no `/r/`. Não há o que reverter aqui pelo motivo "anúncio reprovado".

---

## 4. "Voltar como estava, só código" — pegadinhas com a infra que fica

Se um dia reverter o redirect (**não recomendado**), atenção: a infra **fica**, e o código antigo não conhece essa infra.

| Reverter | Conflita com a infra que fica? |
|----------|-------------------------------|
| `common/queue-role.ts` (tira o role `redirect`) | **Sim.** O container `xbot-redirect` sobe com `QUEUE_ROLE=redirect`. No `queue-role.ts` antigo, `redirect` é string desconhecida → `runsHeavyQueues()` volta `true` → **o container do redirect vira um worker fantasma** rodando todos os `@Processor`. Se reverter isso, tem que **derrubar o container `xbot-redirect`** junto (aí `route.ts` cai no `backend`). |
| `route.ts` (fetch único) | Ok funcionalmente. Só perde o fallback automático; o container dedicado fica ocioso mas inofensivo. |
| `redirectors.service.ts` (Fase 2/2.5) | Ok em código. Volta o `UPDATE increment` por clique → **reabre o lock** que causou o incidente de 04/09 (os índices novos ajudam, mas o lock de linha única não é resolvido por índice). |
| `platform-settings.service.ts` (cache 60 s do domínio) | Ok. Só volta a ler o domínio do Telegram do banco a cada resolve. |
| `marketing-scheduler` / `meta-sync.processor` (volta o ciclo 15 min) | Sem conflito de infra — mas é **reintroduzir o A1**. |

**Índices do Postgres** (`Lead_workspaceId_telegramId_idx`, `Payment_leadId_idx`, `Payment_createdAt_idx`, `Event_leadId_idx`, `Event_eventName_createdAt_idx`, `RedirectorClick_redirectorId_destination_idx`): infra, ficam. Só o `RedirectorClick(...)` está no `schema.prisma`; os outros ainda são manuais (pendente pôr na migration).

---

## 5. Recomendação

1. **Primeiro:** ver no painel do App Meta o motivo real do bloqueio de 03/09.
2. **Se for volume / automação:** reverter **só A2 (duplicação de campanha)** — e opcionalmente esconder A3 (ativar/pausar em massa) enquanto o App está sob análise. Manter o sync sob demanda (`ec5d25c`).
3. **Não reverter o Bucket B (redirect).** Não é a causa (a decisão de cloaking é idêntica) e reabre o incidente de banco de 04/09.
4. **Não reverter o Bucket C (relatórios).** Sem relação.
5. A parte "read-only" do módulo (Visão Geral, atribuição de vendas lendo `Payment`, funil) pode ficar — não fala com a Meta.

### Commits por bucket (referência pra `git revert`)

- **A2 duplicação:** `4a12efd`, `cbfc4d5`
- **A3 ações em massa Meta:** `7ae81a6` (+ parte de `98737de`)
- **A1/C3 sync:** `8235aec` (Fase 1, ciclo) já neutralizado por `ec5d25c` — não mexer
- **B redirect:** `8c16e25`, `d578cf8`, `831f028` (+ `5da3ed2`) — **manter**
- **C relatórios:** `c86eb26`, `d5b294d`, `3122861` — **manter**
