# Telegram Bot API — Documentação

Referências oficiais:
- https://core.telegram.org/bots/api
- https://core.telegram.org/bots
- https://core.telegram.org/bots/webhooks
- https://core.telegram.org/bots/samples

---

## Autenticação

Cada bot recebe um token único do @BotFather no formato:

```
123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
```

Todas as requests usam:

```
https://api.telegram.org/bot<token>/METHOD_NAME
```

## Métodos HTTP

- **GET** e **POST** suportados
- Parâmetros: query string, form-urlencoded, JSON, multipart/form-data
- Resposta: JSON com `{ ok: boolean, result?, description?, error_code? }`

## Recebendo Updates

Duas formas mutuamente exclusivas:

### 1. getUpdates (long polling)

```
GET /bot<token>/getUpdates?offset=...&limit=100&timeout=30
```

- Útil para desenvolvimento, sem necessidade de servidor público
- Desativado automaticamente quando webhook está ativo

### 2. setWebhook (push)

```
POST /bot<token>/setWebhook
```

Telegram envia POST HTTPS para a URL configurada com JSON do Update.

## Webhooks — Requisitos Obrigatórios

1. **HTTPS obrigatório** — Não funciona com HTTP puro (desde Agosto 2021)
2. **Portas suportadas**: 443, 80, 88, 8443
3. **IPs do Telegram**: `149.154.160.0/20` e `91.108.4.0/22`
4. **TLS 1.2+** obrigatório (SSLv2/3, TLS 1.0/1.1 rejeitados)
5. **Domínio** necessário (ou IP com certificado auto-assinado)
6. **Certificado** pode ser verificado (CA confiável) ou auto-assinado

### Certificado Auto-Assinado

Geração:

```bash
openssl req -newkey rsa:2048 -sha256 -nodes -keyout private.key \
  -x509 -days 365 -out public.pem \
  -subj "/C=US/ST=NY/L=Brooklyn/O=Company/CN=SEU_DOMINIO"
```

Setup do webhook:

```bash
curl -F "url=https://SEU_DOMINIO:PORTA/WEBHOOK_PATH" \
  -F "certificate=@public.pem" \
  https://api.telegram.org/bot<TOKEN>/setWebhook
```

### Certificado Verificado (CA confiável)

Apenas URL:

```bash
curl -F "url=https://SEU_DOMINIO/WEBHOOK_PATH" \
  https://api.telegram.org/bot<TOKEN>/setWebhook
```

### Limpar webhook

```bash
curl -F "url=" https://api.telegram.org/bot<TOKEN>/setWebhook
```

### Secret Token

Parâmetro `secret_token` — enviado no header `X-Telegram-Bot-Api-Secret-Token` em toda request.

### Parâmetros do setWebhook

| Parâmetro | Tipo | Obrigatório | Descrição |
|-----------|------|-------------|-----------|
| url | String | Sim | URL HTTPS para receber updates |
| certificate | InputFile | Não | Certificado público (para auto-assinado) |
| ip_address | String | Não | IP fixo para envio (opcional) |
| max_connections | Integer | Não | 1-100, default 40 |
| allowed_updates | Array | Não | Tipos de update a receber |
| drop_pending_updates | Boolean | Não | Limpar updates pendentes |
| secret_token | String | Não | Token secreto 1-256 chars |

### getWebhookInfo

```
GET /bot<token>/getWebhookInfo
```

Retorna WebhookInfo com: url, has_custom_certificate, pending_update_count,
last_error_date, last_error_message, max_connections, allowed_updates.

## Usando Vercel como Proxy HTTPS para Webhook

Como o Vercel tem HTTPS nativo (mesmo no plano Hobby), podemos usar:

```
TELEGRAM_WEBHOOK_URL = https://telegram-saas-frontend.vercel.app/api/webhooks/telegram
```

Fluxo:
1. Telegram → POST HTTPS → Vercel
2. Next.js rewrite (next.config.js) → proxy para backend HTTP
3. Nginx → backend Docker (porta 3001)

## Local Bot API Server

Repositório: https://github.com/tdlib/telegram-bot-api

Vantagens:
- Download sem limite de tamanho
- Upload até 2000 MB
- Webhook pode usar HTTP (sem HTTPS)
- Qualquer IP/porta local
- max_connections até 100000

## Métodos Comuns

### getMe
```
GET /bot<token>/getMe
```
Retorna: id, is_bot, first_name, username, can_join_groups, etc.

### sendMessage
```
POST /bot<token>/sendMessage
```
Parâmetros: chat_id, text, parse_mode, entities, reply_markup, etc.

### Resposta Rápida (durante webhook)
No response do webhook, incluir `method` no body JSON:

```json
{
  "method": "sendMessage",
  "chat_id": 123,
  "text": "Resposta rápida"
}
```

## Libraries Recomendadas (TypeScript/JS)

- **grammY** — https://github.com/grammyjs/grammY
- **Telegraf** — https://github.com/telegraf/telegraf
- **Node-Telegram-bot** — https://github.com/yagop/node-telegram-bot-api

## Estrutura do Update

```typescript
type Update = {
  update_id: number
  message?: Message
  edited_message?: Message
  channel_post?: Message
  edited_channel_post?: Message
  callback_query?: CallbackQuery
  inline_query?: InlineQuery
  chosen_inline_result?: ChosenInlineResult
  poll?: Poll
  poll_answer?: PollAnswer
  my_chat_member?: ChatMemberUpdated
  chat_member?: ChatMemberUpdated
  chat_join_request?: ChatJoinRequest
  // ...
}
```
