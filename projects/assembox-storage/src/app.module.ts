import { Module } from '@nestjs/common';

import { CommonModule } from './common/common.module';
import { AbComponentModule } from './modules/component/component.module';
import { AbConfigModule } from './modules/config/config.module';
import { AbModuleModule } from './modules/module/module.module';
import { ShareModule } from './share.module';

/**
 * 应用根模块
 * 导入所有业务模块和公共模块
 */
@Module({
  imports: [
    ShareModule,    // 基础设施模块（数据库）
    CommonModule,    // 公共模块（Redis、OSS、缓存等）
    AbModuleModule, // 模块管理
    AbComponentModule, // 组件管理
    AbConfigModule, // 配置管理
  ],
})
export class AppModule { }
