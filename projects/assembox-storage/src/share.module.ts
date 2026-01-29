import { Global } from '@nestjs/common';
import { CSModule } from '@cs/nest-cloud';
import { DatabaseModule } from '@cs/nest-typeorm';
import { RedisModule } from '@cs/nest-redis';
import { FileStorageModule } from '@cs/nest-files';
import { ConfigService } from '@cs/nest-config';

// 导入实体
import {
  AbModule,
  AbModuleVersion,
  AbComponent,
  AbConfig,
  AbConfigHistory,
} from './entities';

// 导入仓储
import {
  ModuleRepository,
  ModuleVersionRepository,
  ComponentRepository,
  ConfigRepository,
  ConfigHistoryRepository,
} from './repositories';

/**
 * 共享模块
 * 注册所有公共组件：数据库、Redis、OSS 等
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
          entities: [
            AbModule,
            AbModuleVersion,
            AbComponent,
            AbConfig,
            AbConfigHistory,
          ],
          repositories: [
            ModuleRepository,
            ModuleVersionRepository,
            ComponentRepository,
            ConfigRepository,
            ConfigHistoryRepository,
          ],
        };
      },
    }),

    // Redis 模块（异步配置）
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return config.get('redis');
      },
    }),

    // OSS 文件存储模块（异步配置）
    FileStorageModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return config.get('oss');
      },
    }),
  ],
  exports: [DatabaseModule, RedisModule, FileStorageModule],
})
export class ShareModule {}
