/**
 * 插件接口定义
 */

/**
 * 钩子执行阶段
 */
export enum HookStage {
  BEFORE_CREATE = 'beforeCreate',
  AFTER_CREATE = 'afterCreate',
  BEFORE_UPDATE = 'beforeUpdate',
  AFTER_UPDATE = 'afterUpdate',
  BEFORE_DELETE = 'beforeDelete',
  AFTER_DELETE = 'afterDelete',
  BEFORE_QUERY = 'beforeQuery',
  AFTER_QUERY = 'afterQuery',
  ON_ERROR = 'onError',
}

/**
 * 钩子上下文
 */
export interface HookContext {
  // 模型信息
  modelCode: string;
  modelId: string;

  // 操作信息
  actionCode: string;
  stage: HookStage;

  // 数据
  data?: Record<string, any>;
  result?: any;
  error?: Error;

  // 请求上下文
  tenantCode: string;
  userId?: string;
  userName?: string;

  // 元数据
  metadata?: Record<string, any>;
}

/**
 * 钩子执行结果
 */
export interface HookResult {
  // 是否中止后续操作
  abort?: boolean;
  // 中止原因
  abortReason?: string;
  // 修改后的数据
  data?: Record<string, any>;
  // 附加元数据
  metadata?: Record<string, any>;
}

/**
 * 钩子函数类型
 */
export type HookHandler = (context: HookContext) => Promise<HookResult | void>;

/**
 * 插件接口
 */
export interface IPlugin {
  /**
   * 插件代码（唯一标识）
   */
  code: string;

  /**
   * 插件名称
   */
  name: string;

  /**
   * 插件描述
   */
  description?: string;

  /**
   * 插件版本
   */
  version: string;

  /**
   * 是否启用
   */
  enabled: boolean;

  /**
   * 插件优先级（数字越小优先级越高）
   */
  priority?: number;

  /**
   * 初始化插件
   */
  onInit?(): Promise<void>;

  /**
   * 销毁插件
   */
  onDestroy?(): Promise<void>;

  /**
   * 获取钩子处理器
   */
  getHook(stage: HookStage): HookHandler | undefined;

  /**
   * 获取所有钩子
   */
  getAllHooks(): Map<HookStage, HookHandler>;
}

/**
 * 插件配置
 */
export interface PluginConfig {
  code: string;
  enabled: boolean;
  priority?: number;
  options?: Record<string, any>;
}

/**
 * 插件注册信息
 */
export interface PluginRegistration {
  plugin: IPlugin;
  config: PluginConfig;
  registeredAt: Date;
}
