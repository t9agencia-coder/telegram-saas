import { Module } from '@nestjs/common';
import { ContencaoService } from './contencao.service';
import { ContencaoController } from './contencao.controller';
import { AutomationModule } from '../automation/automation.module';

/**
 * Depende do AutomationModule só pelo MediaWarmupService — é ele que aquece o
 * cache de mídia de um reserva no momento em que ele entra na fila.
 */
@Module({
  imports: [AutomationModule],
  controllers: [ContencaoController],
  providers: [ContencaoService],
  exports: [ContencaoService],
})
export class ContencaoModule {}
