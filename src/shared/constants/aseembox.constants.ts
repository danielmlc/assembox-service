/**
 * AseemBox 常量定义
 */

// 缓存 Key 前缀
export const CACHE_PREFIX = {
  MODEL: 'aseembox:model',
  FIELD: 'aseembox:field',
  RELATION: 'aseembox:relation',
  ACTION: 'aseembox:action',
};

// 缓存 TTL（秒）
export const CACHE_TTL = {
  MODEL: 3600,      // 1小时
  FIELD: 3600,
  RELATION: 3600,
  ACTION: 3600,
};

// 模型状态
export enum ModelStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
}

// 字段类型
export enum FieldType {
  STRING = 'string',
  TEXT = 'text',
  NUMBER = 'number',
  INTEGER = 'integer',
  DECIMAL = 'decimal',
  BOOLEAN = 'boolean',
  DATE = 'date',
  DATETIME = 'datetime',
  TIMESTAMP = 'timestamp',
  JSON = 'json',
  ARRAY = 'array',
  ENUM = 'enum',
  RELATION = 'relation',
  FILE = 'file',
  IMAGE = 'image',
}

// 关联类型
export enum RelationType {
  MANY_TO_ONE = 'many-to-one',
  ONE_TO_MANY = 'one-to-many',
  ONE_TO_ONE = 'one-to-one',
  MANY_TO_MANY = 'many-to-many',
}

// JOIN 类型
export enum JoinType {
  LEFT = 'LEFT',
  INNER = 'INNER',
  RIGHT = 'RIGHT',
}

// Action 类型
export enum ActionType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  SOFT_DELETE = 'softDelete',
  QUERY = 'query',
  AGGREGATE = 'aggregate',
  IMPORT = 'import',
  EXPORT = 'export',
  CUSTOM = 'custom',
}

// 自定义操作处理器类型
export enum CustomHandlerType {
  RPC = 'rpc',
  MQ = 'mq',
  SCRIPT = 'script',
}

// 缓存策略
export enum CacheStrategy {
  NONE = 'none',
  READ = 'read',
  WRITE_THROUGH = 'write-through',
}

// 验证规则类型
export enum ValidationType {
  REGEX = 'regex',
  RANGE = 'range',
  LENGTH = 'length',
  ENUM = 'enum',
  CUSTOM = 'custom',
}

// 默认分页配置
export const DEFAULT_PAGE_CONFIG = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 1000,
};

// 系统字段（自动管理，不允许用户修改）
export const SYSTEM_FIELDS = [
  'id',
  'tenant',
  'createdAt',
  'creatorId',
  'creatorName',
  'modifierAt',
  'modifierId',
  'modifierName',
  'isRemoved',
  'version',
];

// 必要字段（表必须包含的字段）
export const REQUIRED_TABLE_FIELDS = ['id', 'tenant'];
