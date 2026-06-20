import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import { TelegramBotsService } from '../telegram-bots/telegram-bots.service';

@Processor('telegram-messages')
export class AutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationProcessor.name);

  constructor(private telegramBotsService: TelegramBotsService) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case 'send-message':
        return this.handleSendMessage(job.data);
      default:
        this.logger.warn(`Unknown job: ${job.name}`);
    }
  }

  private async handleSendMessage(data: { botId: string; chatId: string; message: any }) {
    try {
      const token = await this.telegramBotsService.getRawToken(data.botId);

      if (data.message.type === 'text') {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: data.chatId,
          text: data.message.text,
          parse_mode: 'HTML',
        });
      } else if (data.message.type === 'payment') {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: data.chatId,
          text: `💰 ${data.message.productName}\n\nValor: R$ ${data.message.amount}\n\nClique abaixo para pagar com PIX:`,
          reply_markup: {
            inline_keyboard: [[
              { text: `💳 Pagar R$ ${data.message.amount}`, callback_data: `pay_${data.message.productId || 'checkout'}` }
            ]]
          },
          parse_mode: 'HTML',
        });
      }

      this.logger.log(`Message sent to chat ${data.chatId}`);
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
    }
  }
}
