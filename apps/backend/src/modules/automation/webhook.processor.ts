import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import axios from 'axios';

@Processor('webhook-events')
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  async process(job: Job): Promise<any> {
    try {
      const { url, payload } = job.data;
      await axios.post(url, payload, { timeout: 10000 });
      this.logger.log(`Webhook sent to ${url}`);
    } catch (error) {
      this.logger.error(`Webhook failed: ${error.message}`);
    }
  }
}
