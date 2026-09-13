import { Global, Module } from '@nestjs/common';
import { MediaStoreService } from './media-store.service';

// Global igual Prisma/Redis: a mídia-teca é usada pelo editor (grava no upload)
// e pelo aquecimento nos workers (lê pra reenviar) — não faz sentido cada módulo
// ter que importar.
@Global()
@Module({
  providers: [MediaStoreService],
  exports: [MediaStoreService],
})
export class MediaStoreModule {}
