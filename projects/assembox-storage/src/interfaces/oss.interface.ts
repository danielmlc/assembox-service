/**
 * OSS 上传参数
 */
export interface OssUploadParams {
  key: string;
  content: string | Buffer;
  contentType?: string;
}

/**
 * OSS 下载参数
 */
export interface OssDownloadParams {
  key: string;
}

/**
 * OSS 列表查询参数
 */
export interface OssListParams {
  prefix: string;
  maxKeys?: number;
}

/**
 * OSS 文件信息
 */
export interface OssFileInfo {
  key: string;
  size: number;
  lastModified: Date;
}

/**
 * OSS 操作结果
 */
export interface OssOperationResult {
  success: boolean;
  key?: string;
  error?: string;
}
