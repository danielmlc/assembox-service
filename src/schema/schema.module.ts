import { Module } from '@nestjs/common';
import { MetaModule } from '../meta';
import {
  TableInspectorService,
  TableBindingService,
  DDLGeneratorService,
} from './services';

/**
 * Schema 管理模块
 * 负责表预埋模式下的表结构管理
 */
@Module({
  imports: [MetaModule],
  providers: [
    TableInspectorService,
    TableBindingService,
    DDLGeneratorService,
  ],
  exports: [
    TableInspectorService,
    TableBindingService,
    DDLGeneratorService,
  ],
})
export class SchemaModule {}
