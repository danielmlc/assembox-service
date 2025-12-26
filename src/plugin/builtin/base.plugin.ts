import { IPlugin, HookStage, HookHandler, HookContext, HookResult } from '../interfaces';

/**
 * 插件基类
 * 提供插件的基本实现
 */
export abstract class BasePlugin implements IPlugin {
  abstract code: string;
  abstract name: string;
  description?: string;
  version: string = '1.0.0';
  enabled: boolean = true;
  priority?: number = 100;

  protected hooks: Map<HookStage, HookHandler> = new Map();

  /**
   * 初始化插件
   */
  async onInit(): Promise<void> {
    // 子类可以重写
  }

  /**
   * 销毁插件
   */
  async onDestroy(): Promise<void> {
    // 子类可以重写
  }

  /**
   * 获取钩子处理器
   */
  getHook(stage: HookStage): HookHandler | undefined {
    return this.hooks.get(stage);
  }

  /**
   * 获取所有钩子
   */
  getAllHooks(): Map<HookStage, HookHandler> {
    return this.hooks;
  }

  /**
   * 注册钩子
   */
  protected registerHook(stage: HookStage, handler: HookHandler): void {
    this.hooks.set(stage, handler);
  }
}
