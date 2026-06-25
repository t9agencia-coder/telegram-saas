/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TEMPLATE PIX OFICIAL — COMPONENTE PROTEGIDO
 *  Arquivo: apps/backend/src/modules/webhooks/pix-template.ts
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  ⚠️  ATENÇÃO — LEIA ANTES DE QUALQUER ALTERAÇÃO
 *
 *  Este arquivo é o Template PIX Oficial do sistema FireBot.
 *  Ele define a experiência visual completa do pagamento PIX no Telegram.
 *
 *  ❌  NÃO ALTERE:
 *        - Layout ou estrutura das mensagens
 *        - Textos, emojis ou espaçamentos
 *        - Formatação Markdown
 *        - Ordem dos elementos
 *        - Botões do teclado inline
 *        - Caption do QR Code
 *        - parse_mode
 *
 *  ✅  PODE ALTERAR (campos dinâmicos — ver interfaces abaixo):
 *        - Valor (R$ X,XX)
 *        - Nome do plano
 *        - Código PIX Copia e Cola
 *        - Minutos restantes (lembretes)
 *        - ID da cobrança (botão verificar)
 *
 *  REGRA OBRIGATÓRIA PARA FUTURAS MANUTENÇÕES:
 *    Toda correção de integração, adquirente, API, geração de QR Code,
 *    validação de pagamento ou webhook deve preservar integralmente
 *    este template. Altere apenas a lógica — nunca o visual.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── Interfaces dos campos dinâmicos ────────────────────────────────────────

export interface PixMessageData {
  /** Código PIX Copia e Cola gerado pela adquirente */
  pixCode: string;
  /** Valor formatado em BRL: ex. "R$ 97,00" */
  valorBr: string;
  /** Nome do plano selecionado — opcional */
  planLabel?: string;
  /** ID da cobrança para o botão de verificação */
  chargeId: string;
}

export interface PixReminderData {
  /** Código PIX Copia e Cola (mesmo da mensagem original) */
  pixCode: string;
  /** Minutos restantes antes de expirar: 15 (lembrete 1) ou 10 (lembrete 2) */
  minutesLeft: number;
  /** ID da cobrança para o botão de verificação */
  chargeId: string;
}

// ─── Constantes de exibição (NÃO ALTERAR) ───────────────────────────────────

/** parse_mode utilizado em todas as mensagens PIX */
export const PIX_PARSE_MODE = 'Markdown' as const;

/** Caption da foto do QR Code */
export const PIX_QR_CAPTION = '📷 QR Code PIX';

// ─── Renderizadores (NÃO ALTERAR A ESTRUTURA) ───────────────────────────────

/**
 * Mensagem principal PIX.
 * Enviada imediatamente após a geração da cobrança.
 */
export function renderPixMessage(data: PixMessageData): string {
  const { pixCode, valorBr, planLabel } = data;
  const planLine = planLabel ? `🎁 *Plano:* ${planLabel}\n\n` : '';

  return (
    `🌟 Você selecionou o seguinte plano:\n\n` +
    `${planLine}` +
    `💰 *Valor:* ${valorBr}\n\n` +
    `💠 Pague via Pix Copia e Cola _(ou QR Code em alguns bancos)_:\n\n` +
    `\`\`\`\n${pixCode}\n\`\`\`\n\n` +
    `👆 Toque na chave PIX acima para copiá-la\n\n` +
    `‼️ Após o pagamento, clique no botão abaixo para verificar o status:`
  );
}

/**
 * Lembrete de pagamento pendente.
 * Enviado em 5 min (15 restantes) e 10 min (10 restantes).
 */
export function renderPixReminder(data: PixReminderData): string {
  const { pixCode, minutesLeft } = data;

  return (
    `⏰ *Lembrete:* Seu PIX ainda não foi pago!\n\n` +
    `Você tem *${minutesLeft} minutos* restantes antes de expirar.\n\n` +
    `💠 *Pix Copia e Cola:*\n\n` +
    `\`\`\`\n${pixCode}\n\`\`\`\n\n` +
    `👆 Copie o código acima e finalize o pagamento!\n\n` +
    `‼️ Após pagar, clique em *Verificar pagamento*:`
  );
}

/**
 * Teclado inline do PIX.
 * Botão "Copiar código" incluído apenas quando pixCode ≤ 256 chars (limite da API Telegram).
 */
export function renderPixKeyboard(chargeId: string, pixCode: string): any[][] {
  const keyboard: any[][] = [
    [{ text: '✅ Verificar pagamento', callback_data: `check_${chargeId}` }],
  ];
  if (pixCode.length <= 256) {
    keyboard.push([{ text: '📋 Copiar código PIX', copy_text: { text: pixCode } }]);
  }
  return keyboard;
}

/**
 * URL do QR Code via serviço público — sem dependência de biblioteca extra.
 * Altere apenas se o serviço mudar de endereço.
 */
export function pixQrCodeUrl(pixCode: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(pixCode)}`;
}
