import { CSModule } from '@cs/nest-cloud';
import { ConfigService } from '@cs/nest-config';
import { FileStorageModule } from '@cs/nest-files';
import { RedisModule } from '@cs/nest-redis';
import { DatabaseModule } from '@cs/nest-typeorm';
import { Global } from '@nestjs/common';

/**
 * 共享模块
 * 注册数据库连接，供所有业务模块使用
 */
@Global()
@CSModule({
  imports: [
    // 数据库模块（异步配置）
    DatabaseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return {
          ...config.get('mysql'),
        };
      },
    }),
    FileStorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return {
          ...config.get('fileStorage'),
        };
      },
    }),
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        // 确保 options 对象存在
        return {
          ...config.get('redis')
        };
      },
    }),
  ],
  exports: [DatabaseModule, FileStorageModule, RedisModule],
})
export class ShareModule { }
