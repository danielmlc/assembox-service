/**
 * OSS 存储区域
 */
export enum OssArea {
  DRAFT = 'draft',
  PUBLISHED = 'published',
}

/**
 * OSS 基础路径前缀
 */
export const OSS_BASE_PREFIX = 'assembox';

/**
 * Redis 缓存键前缀
 */
export const REDIS_PREFIX = {
  // L1: 租户配置缓存 (继承查找结果)
  CONFIG: 'assembox:config',
  // L2: 原始配置缓存
  RAW: 'assembox:raw',
  // L3: 组件列表缓存
  COMPONENTS: 'assembox:components',
};

/**
 * 缓存 TTL (秒)
 */
export const CACHE_TTL = {
  // L1: 租户配置缓存 - 1小时
  CONFIG: 3600,
  // L2: 原始配置缓存 - 30分钟
  RAW: 1800,
  // L3: 组件列表缓存 - 10分钟
  COMPONENTS: 600,
};

/**
 * 默认配置
 */
export const DEFAULT_CONFIG = {
  // 默认产品标识（用于OSS路径）
  PRODUCT: 'assembox',
  // OSS 文件后缀
  FILE_EXTENSION: '.json',
};
