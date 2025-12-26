import { Injectable, Logger } from '@nestjs/common';
import { PluginRegistryService } from './plugin-registry.service';
import { HookStage, HookContext, HookResult, HookHandler } from '../interfaces';

/**
 * 钩子执行配置
 */
export interface HookExecutionConfig {
  // 执行超时时间（毫秒）
  timeout?: number;
  // 是否在错误时继续执行后续钩子
  continueOnError?: boolean;
  // 是否异步执行（不等待结果）
  async?: boolean;
}

/**
 * 钩子执行结果
 */
export interface HookExecutionResult {
  success: boolean;
  aborted: boolean;
  abortReason?: string;
  modifiedData?: Record<string, any>;
  errors: Array<{
    pluginCode: string;
    error: string;
  }>;
  executedPlugins: string[];
}

/**
 * 插件执行服务
 * 负责执行插件钩子
 */
@Injectable()
export class PluginExecutorService {
  private readonly logger = new Logger(PluginExecutorService.name);

  // 默认超时时间
  private readonly DEFAULT_TIMEOUT = 30000; // 30秒

  constructor(private readonly pluginRegistry: PluginRegistryService) {}

  /**
   * 执行指定阶段的所有钩子
   */
  async executeHooks(
    stage: HookStage,
    context: HookContext,
    config: HookExecutionConfig = {},
  ): Promise<HookExecutionResult> {
    const plugins = this.pluginRegistry.getPluginsForStage(stage);
    const result: HookExecutionResult = {
      success: true,
      aborted: false,
      errors: [],
      executedPlugins: [],
    };

    // 如果异步执行，立即返回
    if (config.async) {
      this.executeHooksAsync(stage, context, plugins, config);
      return result;
    }

    let currentContext = { ...context };

    for (const plugin of plugins) {
      const hook = plugin.getHook(stage);
      if (!hook) continue;

      try {
        const hookResult = await this.executeHookWithTimeout(
          hook,
          currentContext,
          config.timeout || this.DEFAULT_TIMEOUT,
          plugin.code,
        );

        result.executedPlugins.push(plugin.code);

        if (hookResult) {
          // 检查是否需要中止
          if (hookResult.abort) {
            result.aborted = true;
            result.abortReason = hookResult.abortReason || `Aborted by plugin: ${plugin.code}`;
            result.success = false;
            this.logger.warn(`Hook execution aborted by plugin ${plugin.code}: ${result.abortReason}`);
            break;
          }

          // 合并修改后的数据
          if (hookResult.data) {
            currentContext.data = {
              ...currentContext.data,
              ...hookResult.data,
            };
            result.modifiedData = currentContext.data;
          }

          // 合并元数据
          if (hookResult.metadata) {
            currentContext.metadata = {
              ...currentContext.metadata,
              ...hookResult.metadata,
            };
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error executing hook for plugin ${plugin.code}: ${errorMessage}`);

        result.errors.push({
          pluginCode: plugin.code,
          error: errorMessage,
        });

        if (!config.continueOnError) {
          result.success = false;
          break;
        }
      }
    }

    return result;
  }

  /**
   * 执行 beforeCreate 钩子
   */
  async executeBeforeCreate(context: HookContext): Promise<HookExecutionResult> {
    return this.executeHooks(HookStage.BEFORE_CREATE, {
      ...context,
      stage: HookStage.BEFORE_CREATE,
    });
  }

  /**
   * 执行 afterCreate 钩子
   */
  async executeAfterCreate(context: HookContext): Promise<HookExecutionResult> {
    return this.executeHooks(
      HookStage.AFTER_CREATE,
      { ...context, stage: HookStage.AFTER_CREATE },
      { continueOnError: true }, // afterCreate 通常继续执行
    );
  }

  /**
   * 执行 beforeUpdate 钩子
   */
  async executeBeforeUpdate(context: HookContext): Promise<HookExecutionResult> {
    return this.executeHooks(HookStage.BEFORE_UPDATE, {
      ...context,
      stage: HookStage.BEFORE_UPDATE,
    });
  }

  /**
   * 执行 afterUpdate 钩子
   */
  async executeAfterUpdate(context: HookContext): Promise<HookExecutionResult> {
    return this.executeHooks(
      HookStage.AFTER_UPDATE,
      { ...context, stage: HookStage.AFTER_UPDATE },
      { continueOnError: true },
    );
  }

  /**
   * 执行 beforeDelete 钩子
   */
  async executeBeforeDelete(context: HookContext): Promise<HookExecutionResult> {
    return this.executeHooks(HookStage.BEFORE_DELETE, {
      ...context,
      stage: HookStage.BEFORE_DELETE,
    });
  }

  /**
   * 执行 afterDelete 钩子
   */
  async executeAfterDelete(context: HookContext): Promise<HookExecutionResult> {
    return this.executeHooks(
      HookStage.AFTER_DELETE,
      { ...context, stage: HookStage.AFTER_DELETE },
      { continueOnError: true },
    );
  }

  /**
   * 执行 beforeQuery 钩子
   */
  async executeBeforeQuery(context: HookContext): Promise<HookExecutionResult> {
    return this.executeHooks(HookStage.BEFORE_QUERY, {
      ...context,
      stage: HookStage.BEFORE_QUERY,
    });
  }

  /**
   * 执行 afterQuery 钩子
   */
  async executeAfterQuery(context: HookContext): Promise<HookExecutionResult> {
    return this.executeHooks(
      HookStage.AFTER_QUERY,
      { ...context, stage: HookStage.AFTER_QUERY },
      { continueOnError: true },
    );
  }

  /**
   * 执行 onError 钩子
   */
  async executeOnError(context: HookContext): Promise<HookExecutionResult> {
    return this.executeHooks(
      HookStage.ON_ERROR,
      { ...context, stage: HookStage.ON_ERROR },
      { continueOnError: true }, // 错误处理钩子继续执行
    );
  }

  /**
   * 异步执行钩子（不等待结果）
   */
  private async executeHooksAsync(
    stage: HookStage,
    context: HookContext,
    plugins: any[],
    config: HookExecutionConfig,
  ): Promise<void> {
    // 在后台执行，不阻塞主流程
    setImmediate(async () => {
      for (const plugin of plugins) {
        const hook = plugin.getHook(stage);
        if (!hook) continue;

        try {
          await this.executeHookWithTimeout(
            hook,
            context,
            config.timeout || this.DEFAULT_TIMEOUT,
            plugin.code,
          );
        } catch (error) {
          this.logger.error(
            `Async hook error for plugin ${plugin.code}: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
    });
  }

  /**
   * 带超时的钩子执行
   */
  private async executeHookWithTimeout(
    hook: HookHandler,
    context: HookContext,
    timeout: number,
    pluginCode: string,
  ): Promise<HookResult | void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Hook timeout after ${timeout}ms for plugin: ${pluginCode}`));
      }, timeout);

      hook(context)
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }
}
