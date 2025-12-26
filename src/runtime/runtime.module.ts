import { Module } from '@nestjs/common';
import { MetaModule } from '../meta';
import {
  SqlBuilderService,
  JoinBuilderService,
  DynamicQueryService,
  DynamicMutationService,
  DynamicValidatorService,
} from './services';
import { DynamicApiController } from './controllers';
import { TenantInterceptor } from './interceptors';

/**
 * 运行时模块
 * 负责动态数据操作
 * 注意：DataSourceManagerImpl 通过 DATA_SOURCE_MANAGER token 从 SharedModule 自动注入
 */
@Module({
  imports: [MetaModule],
  controllers: [DynamicApiController],
  providers: [
    SqlBuilderService,
    JoinBuilderService,
    DynamicQueryService,
    DynamicMutationService,
    DynamicValidatorService,
    TenantInterceptor,
  ],
  exports: [
    SqlBuilderService,
    JoinBuilderService,
    DynamicQueryService,
    DynamicMutationService,
    DynamicValidatorService,
    TenantInterceptor,
  ],
})
export class RuntimeModule {}
