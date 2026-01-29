import { Module } from '@nestjs/common';

import { ComponentController } from './controllers/component.controller';
import { ComponentRepository } from './repositories/component.repository';
import { ComponentService } from './services/component.service';

/**
 * 组件管理模块
 * 负责组件的管理
 */
@Module({
  controllers: [
    ComponentController,
  ],
  providers: [
    ComponentRepository,
    ComponentService,
  ],
  exports: [
    ComponentRepository,
    ComponentService,
  ],
})
export class AbComponentModule { }
