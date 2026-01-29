import { Module } from '@nestjs/common';
import { ShareModule } from './share.module';

// Services
import {
  OssService,
  CacheService,
  ConfigResolverService,
  ConfigService,
  ModuleService,
  ComponentService,
  VersionService,
} from './services';

// Controllers
import {
  ConfigController,
  ModuleController,
  ComponentController,
} from './controllers';

/**
 * 应用根模块
 * 导入 ShareModule 获取公共组件（数据库、Redis、OSS）
 */
@Module({
  imports: [
    ShareModule, // 导入共享模块（包含数据库、Redis、OSS）
  ],
  controllers: [
    ConfigController,
    ModuleController,
    ComponentController,
  ],
  providers: [
    // 业务服务
    OssService,
    CacheService,
    ConfigResolverService,
    ConfigService,
    ModuleService,
    ComponentService,
    VersionService,
  ],
  exports: [
    // 导出业务服务供其他模块使用
    ConfigResolverService,
    ConfigService,
    ModuleService,
    ComponentService,
    VersionService,
  ],
})
export class AppModule {}
