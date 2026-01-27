import { ConfigScope } from '../entities';

/**
 * 配置加载上下文
 */
export interface LoadContext {
  moduleCode: string;
  versionCode: string;
  componentType: string;
  componentCode: string;
  tenant: string;
}

/**
 * 组件元信息
 */
export interface ComponentMeta {
  id: string;
  componentCode: string;
  componentName: string;
  componentType: string;
  category: string;
  isInheritable: boolean;
  isCacheable: boolean;
}

/**
 * 配置信息
 */
export interface ConfigInfo {
  scope: ConfigScope;
  tenant?: string;
  moduleCode: string;
  versionCode: string;
  componentType: string;
  componentCode: string;
}

/**
 * OSS Key 生成参数
 */
export interface OssKeyParams extends ConfigInfo {
  area: 'draft' | 'published';
}

/**
 * 配置内容
 */
export interface ConfigContent {
  [key: string]: any;
}

/**
 * 配置查询结果
 */
export interface ConfigResult {
  config: ConfigContent;
  scope: ConfigScope;
  tenant?: string;
  ossKey: string;
  publishVersion: number;
}
