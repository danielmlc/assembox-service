import { Module } from '@nestjs/common';
import { AbComponentModule } from '../component/component.module';
// Controllers
import { ConfigController } from './controllers/config.controller';
// Repositories
import { ConfigRepository } from './repositories/config.repository';
import { ConfigHistoryRepository } from './repositories/config-history.repository';
// Services
import { ConfigService } from './services/config.service';
import { ConfigResolverService } from './services/config-resolver.service';

/**
 * 配置管理模块
 * 负责配置和配置历史的管理
 */
@Module({
  imports: [
    AbComponentModule, // 导入 component 模块以使用 ComponentRepository
  ],
  controllers: [
    ConfigController,
  ],
  providers: [
    ConfigRepository,
    ConfigHistoryRepository,
    ConfigService,
    ConfigResolverService,
  ],
  exports: [
    ConfigRepository,
    ConfigHistoryRepository,
    ConfigService,
    ConfigResolverService,
  ],
})
export class AbConfigModule {}
