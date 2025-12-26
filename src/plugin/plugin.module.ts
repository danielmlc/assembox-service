import { Module, OnModuleInit } from '@nestjs/common';
import { PluginRegistryService, PluginExecutorService } from './services';
import { IdGeneratorPlugin, AuditFieldsPlugin, DataEventPlugin } from './builtin';

/**
 * 插件系统模块
 * 负责插件的注册、执行和生命周期管理
 */
@Module({
  providers: [
    PluginRegistryService,
    PluginExecutorService,
    // 内置插件
    IdGeneratorPlugin,
    AuditFieldsPlugin,
    DataEventPlugin,
  ],
  exports: [
    PluginRegistryService,
    PluginExecutorService,
  ],
})
export class PluginModule implements OnModuleInit {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly idGeneratorPlugin: IdGeneratorPlugin,
    private readonly auditFieldsPlugin: AuditFieldsPlugin,
    private readonly dataEventPlugin: DataEventPlugin,
  ) {}

  async onModuleInit() {
    // 注册内置插件
    await this.pluginRegistry.register(this.idGeneratorPlugin);
    await this.pluginRegistry.register(this.auditFieldsPlugin);
    await this.pluginRegistry.register(this.dataEventPlugin);
  }
}
