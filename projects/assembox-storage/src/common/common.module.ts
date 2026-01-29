import { Module, Global } from '@nestjs/common';
import { RedisModule } from '@cs/nest-redis';
import { FileStorageModule } from '@cs/nest-files';
import { ConfigService } from '@cs/nest-config';

// Services
import { CacheService } from './services/cache.service';
import { OssService } from './services/oss.service';

/**
 * 公共模块
 * 提供跨模块的公共服务：缓存、OSS 等
 */
@Global()
@Module({
  imports: [
  ],
  providers: [
    CacheService,
    OssService,
  ],
  exports: [
    CacheService,
    OssService,
  ],
})
export class CommonModule { }
