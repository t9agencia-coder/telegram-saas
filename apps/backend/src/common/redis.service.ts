import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor() {
    super({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });

    this.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });
  }

  async onModuleDestroy() {
    await this.quit();
  }
}
