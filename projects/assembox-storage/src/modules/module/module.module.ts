import { Module } from '@nestjs/common';

import { ModuleController } from './controllers/module.controller';
import { ModuleVersionRepository } from './repositories/module-version.repository';
import { ModuleRepository } from './repositories/module.repository';
import { ModuleService } from './services/module.service';
import { VersionService } from './services/version.service';

/**
 * 模块管理模块
 * 负责模块和版本的管理
 */
@Module({
  controllers: [
    ModuleController,
  ],
  providers: [
    ModuleRepository,
    ModuleVersionRepository,
    ModuleService,
    VersionService,
  ],
  exports: [
    ModuleRepository,
    ModuleVersionRepository,
    ModuleService,
    VersionService,
  ],
})
export class AbModuleModule {}
