/**
 * 查询相关 DTO
 */

/**
 * 查询条件操作符
 */
export type QueryOperator =
  | 'eq'       // 等于
  | 'ne'       // 不等于
  | 'gt'       // 大于
  | 'gte'      // 大于等于
  | 'lt'       // 小于
  | 'lte'      // 小于等于
  | 'like'     // 模糊匹配
  | 'notLike'  // 不匹配
  | 'in'       // 在列表中
  | 'notIn'    // 不在列表中
  | 'isNull'   // 为空
  | 'isNotNull' // 不为空
  | 'between';  // 在范围内

/**
 * 单个查询条件
 */
export interface QueryCondition {
  field: string;
  operator: QueryOperator;
  value?: any;
}

/**
 * 排序方向
 */
export type SortDirection = 'ASC' | 'DESC';

/**
 * 排序配置
 */
export interface SortConfig {
  field: string;
  direction: SortDirection;
}

/**
 * 查询选项
 */
export interface QueryOptions {
  // 选择字段
  select?: string[];
  // 查询条件
  where?: QueryCondition[];
  // 排序
  orderBy?: SortConfig[];
  // 分页
  page?: number;
  pageSize?: number;
  // 包含的关联
  include?: string[];
}

/**
 * 查询请求 DTO
 */
export class QueryDto implements QueryOptions {
  select?: string[];
  where?: QueryCondition[];
  orderBy?: SortConfig[];
  page?: number;
  pageSize?: number;
  include?: string[];
}

/**
 * 分页结果
 */
export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 聚合查询选项
 */
export interface AggregateOptions {
  // 分组字段
  groupBy?: string[];
  // 聚合函数
  aggregates: AggregateFunction[];
  // 查询条件
  where?: QueryCondition[];
  // Having 条件
  having?: QueryCondition[];
}

/**
 * 聚合函数配置
 */
export interface AggregateFunction {
  function: 'count' | 'sum' | 'avg' | 'min' | 'max';
  field: string;
  alias: string;
}
