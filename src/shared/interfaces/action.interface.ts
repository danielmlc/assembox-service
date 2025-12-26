import { ActionType, CustomHandlerType } from '../constants/aseembox.constants';

/**
 * 钩子配置接口
 */
export interface HookConfig {
  pluginCode: string;
  method: string;
  async: boolean;
  order: number;
  condition?: string;
}

/**
 * 查询配置接口
 */
export interface QueryActionConfig {
  defaultPageSize: number;
  maxPageSize: number;
  allowedFilters?: string[];
  allowedSorts?: string[];
  defaultSort?: Record<string, 'ASC' | 'DESC'>;
}

/**
 * 变更配置接口
 */
export interface MutationActionConfig {
  allowedFields?: string[];
  requiredFields?: string[];
  uniqueFields?: string[];
}

/**
 * RPC 配置接口
 */
export interface RpcActionConfig {
  serviceName: string;
  methodName: string;
}

/**
 * MQ 配置接口
 */
export interface MqActionConfig {
  topic: string;
  tags?: string;
}

/**
 * 自定义操作配置接口
 */
export interface CustomActionConfig {
  handler: CustomHandlerType;
  rpcConfig?: RpcActionConfig;
  mqConfig?: MqActionConfig;
  script?: string;
}

/**
 * 操作定义接口
 */
export interface IActionDefinition {
  id: string;
  code: string;
  name: string;
  description?: string;
  modelId: string;

  type: ActionType;
  permissions?: string[];

  hooks?: {
    beforeExecute?: HookConfig[];
    afterExecute?: HookConfig[];
    onError?: HookConfig[];
  };

  queryConfig?: QueryActionConfig;
  mutationConfig?: MutationActionConfig;
  customConfig?: CustomActionConfig;

  enabled: boolean;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建操作 DTO
 */
export interface CreateActionDto {
  code: string;
  name: string;
  description?: string;
  type: ActionType;
  permissions?: string[];
  hooks?: {
    beforeExecute?: HookConfig[];
    afterExecute?: HookConfig[];
    onError?: HookConfig[];
  };
  queryConfig?: QueryActionConfig;
  mutationConfig?: MutationActionConfig;
  customConfig?: CustomActionConfig;
  enabled?: boolean;
}

/**
 * 更新操作 DTO
 */
export interface UpdateActionDto extends Partial<CreateActionDto> {}
