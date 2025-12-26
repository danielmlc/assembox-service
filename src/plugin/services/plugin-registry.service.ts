import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { IPlugin, PluginConfig, PluginRegistration, HookStage } from '../interfaces';

/**
 * 插件注册服务
 * 负责管理插件的注册、启用、禁用
 */
@Injectable()
export class PluginRegistryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginRegistryService.name);

  // 已注册的插件
  private readonly plugins: Map<string, PluginRegistration> = new Map();

  // 按优先级排序的插件列表
  private sortedPlugins: PluginRegistration[] = [];

  async onModuleInit() {
    this.logger.log('Plugin registry initialized');
  }

  async onModuleDestroy() {
    // 销毁所有插件
    for (const registration of this.plugins.values()) {
      try {
        if (registration.plugin.onDestroy) {
          await registration.plugin.onDestroy();
        }
      } catch (error) {
        this.logger.error(`Error destroying plugin ${registration.plugin.code}: ${(error as Error).message}`);
      }
    }
    this.plugins.clear();
    this.sortedPlugins = [];
  }

  /**
   * 注册插件
   */
  async register(plugin: IPlugin, config?: Partial<PluginConfig>): Promise<void> {
    const code = plugin.code;

    if (this.plugins.has(code)) {
      throw new Error(`Plugin ${code} is already registered`);
    }

    const fullConfig: PluginConfig = {
      code,
      enabled: config?.enabled ?? plugin.enabled,
      priority: config?.priority ?? plugin.priority ?? 100,
      options: config?.options,
    };

    const registration: PluginRegistration = {
      plugin,
      config: fullConfig,
      registeredAt: new Date(),
    };

    // 初始化插件
    if (plugin.onInit) {
      try {
        await plugin.onInit();
      } catch (error) {
        this.logger.error(`Error initializing plugin ${code}: ${(error as Error).message}`);
        throw error;
      }
    }

    this.plugins.set(code, registration);
    this.updateSortedPlugins();

    this.logger.log(`Plugin registered: ${code} (priority: ${fullConfig.priority})`);
  }

  /**
   * 注销插件
   */
  async unregister(code: string): Promise<void> {
    const registration = this.plugins.get(code);

    if (!registration) {
      throw new Error(`Plugin ${code} is not registered`);
    }

    // 销毁插件
    if (registration.plugin.onDestroy) {
      try {
        await registration.plugin.onDestroy();
      } catch (error) {
        this.logger.error(`Error destroying plugin ${code}: ${(error as Error).message}`);
      }
    }

    this.plugins.delete(code);
    this.updateSortedPlugins();

    this.logger.log(`Plugin unregistered: ${code}`);
  }

  /**
   * 启用插件
   */
  enable(code: string): void {
    const registration = this.plugins.get(code);

    if (!registration) {
      throw new Error(`Plugin ${code} is not registered`);
    }

    registration.config.enabled = true;
    registration.plugin.enabled = true;

    this.logger.log(`Plugin enabled: ${code}`);
  }

  /**
   * 禁用插件
   */
  disable(code: string): void {
    const registration = this.plugins.get(code);

    if (!registration) {
      throw new Error(`Plugin ${code} is not registered`);
    }

    registration.config.enabled = false;
    registration.plugin.enabled = false;

    this.logger.log(`Plugin disabled: ${code}`);
  }

  /**
   * 获取插件
   */
  get(code: string): IPlugin | undefined {
    return this.plugins.get(code)?.plugin;
  }

  /**
   * 获取所有已注册的插件
   */
  getAll(): IPlugin[] {
    return this.sortedPlugins.map(r => r.plugin);
  }

  /**
   * 获取所有启用的插件（按优先级排序）
   */
  getEnabled(): IPlugin[] {
    return this.sortedPlugins
      .filter(r => r.config.enabled)
      .map(r => r.plugin);
  }

  /**
   * 获取指定阶段有钩子的插件
   */
  getPluginsForStage(stage: HookStage): IPlugin[] {
    return this.getEnabled().filter(plugin => plugin.getHook(stage) !== undefined);
  }

  /**
   * 检查插件是否已注册
   */
  has(code: string): boolean {
    return this.plugins.has(code);
  }

  /**
   * 检查插件是否启用
   */
  isEnabled(code: string): boolean {
    const registration = this.plugins.get(code);
    return registration?.config.enabled ?? false;
  }

  /**
   * 更新插件配置
   */
  updateConfig(code: string, config: Partial<PluginConfig>): void {
    const registration = this.plugins.get(code);

    if (!registration) {
      throw new Error(`Plugin ${code} is not registered`);
    }

    if (config.enabled !== undefined) {
      registration.config.enabled = config.enabled;
      registration.plugin.enabled = config.enabled;
    }

    if (config.priority !== undefined) {
      registration.config.priority = config.priority;
      this.updateSortedPlugins();
    }

    if (config.options !== undefined) {
      registration.config.options = {
        ...registration.config.options,
        ...config.options,
      };
    }

    this.logger.log(`Plugin config updated: ${code}`);
  }

  /**
   * 获取插件统计信息
   */
  getStats(): {
    total: number;
    enabled: number;
    disabled: number;
    plugins: Array<{
      code: string;
      name: string;
      enabled: boolean;
      priority: number;
    }>;
  } {
    const all = Array.from(this.plugins.values());
    const enabled = all.filter(r => r.config.enabled);

    return {
      total: all.length,
      enabled: enabled.length,
      disabled: all.length - enabled.length,
      plugins: all.map(r => ({
        code: r.plugin.code,
        name: r.plugin.name,
        enabled: r.config.enabled,
        priority: r.config.priority ?? 100,
      })),
    };
  }

  /**
   * 更新排序后的插件列表
   */
  private updateSortedPlugins(): void {
    this.sortedPlugins = Array.from(this.plugins.values()).sort(
      (a, b) => (a.config.priority ?? 100) - (b.config.priority ?? 100),
    );
  }
}
