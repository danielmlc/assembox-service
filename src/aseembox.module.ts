import { Module } from '@nestjs/common';
import { SharedModule } from './shared/shared.module';
import { MetaModule } from './meta/meta.module';
import { RuntimeModule } from './runtime/runtime.module';
import { SchemaModule } from './schema/schema.module';
import { PluginModule } from './plugin/plugin.module';

@Module({
  imports: [
    SharedModule,
    MetaModule,
    RuntimeModule,
    SchemaModule,
    PluginModule,
  ],
})
export class AseemboxModule {}
