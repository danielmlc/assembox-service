/**
 * 变更相关 DTO
 */

/**
 * 创建数据请求
 */
export interface CreateDataDto {
  data: Record<string, any>;
}

/**
 * 批量创建数据请求
 */
export interface BatchCreateDataDto {
  data: Record<string, any>[];
}

/**
 * 更新数据请求
 */
export interface UpdateDataDto {
  data: Record<string, any>;
}

/**
 * 批量更新数据请求
 */
export interface BatchUpdateDataDto {
  ids: string[];
  data: Record<string, any>;
}

/**
 * 删除数据请求
 */
export interface DeleteDataDto {
  id: string;
}

/**
 * 批量删除数据请求
 */
export interface BatchDeleteDataDto {
  ids: string[];
}

/**
 * 变更结果
 */
export interface MutationResult {
  success: boolean;
  affected: number;
  data?: any;
  id?: string;
  ids?: string[];
}
