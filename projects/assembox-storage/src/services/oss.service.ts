import { Injectable, Logger } from '@nestjs/common';
import { FileStorageService } from '@cs/nest-files';
import { ConfigScope } from '../entities';
import { OSS_BASE_PREFIX, OssArea, DEFAULT_CONFIG } from '../constants';
import {
  OssUploadParams,
  OssDownloadParams,
  OssListParams,
  OssFileInfo,
  OssKeyParams,
} from '../interfaces';
import * as crypto from 'crypto';

/**
 * OSS 存储服务
 * 封装 OSS 操作，生成符合规范的存储路径
 */
@Injectable()
export class OssService {
  private readonly logger = new Logger(OssService.name);

  constructor(private readonly fileStorageService: FileStorageService) {}

  /**
   * 生成 OSS Key
   * 格式: assembox/{area}/{module_code}/{version_code}/{component_type}/{component_code}/{scope_suffix}.json
   */
  generateOssKey(params: OssKeyParams): string {
    const scopeSuffix = this.generateScopeSuffix(params.scope, params.tenant);
    return `${OSS_BASE_PREFIX}/${params.area}/${params.moduleCode}/${params.versionCode}/${params.componentType}/${params.componentCode}/${scopeSuffix}${DEFAULT_CONFIG.FILE_EXTENSION}`;
  }

  /**
   * 生成层级后缀
   */
  private generateScopeSuffix(scope: ConfigScope, tenant?: string): string {
    switch (scope) {
      case ConfigScope.SYSTEM:
        return '_system';
      case ConfigScope.GLOBAL:
        return '_global';
      case ConfigScope.TENANT:
        return `_tenant_${tenant}`;
      default:
        throw new Error(`未知的配置层级: ${scope}`);
    }
  }

  /**
   * 上传配置内容到 OSS
   */
  async upload(params: OssUploadParams): Promise<void> {
    try {
      const content =
        typeof params.content === 'string'
          ? params.content
          : JSON.stringify(params.content, null, 2);

      // 使用 nest-files 的上传功能
      // 注意：这里需要根据实际的 FileStorageService API 进行调整
      const client = this.fileStorageService.getClient();
      await client.put(params.key, Buffer.from(content, 'utf-8'));

      this.logger.log(`成功上传配置到 OSS: ${params.key}`);
    } catch (error) {
      this.logger.error(`上传配置失败: ${params.key}`, error.stack);
      throw new Error(`上传配置失败: ${error.message}`);
    }
  }

  /**
   * 从 OSS 下载配置内容
   */
  async download(params: OssDownloadParams): Promise<string | null> {
    try {
      const client = this.fileStorageService.getClient();
      const result = await client.get(params.key);

      const content = result.content.toString('utf-8');
      this.logger.log(`成功从 OSS 下载配置: ${params.key}`);
      return content;
    } catch (error) {
      if (error.code === 'NoSuchKey') {
        this.logger.warn(`配置不存在: ${params.key}`);
        return null;
      }
      this.logger.error(`下载配置失败: ${params.key}`, error.stack);
      throw new Error(`下载配置失败: ${error.message}`);
    }
  }

  /**
   * 下载并解析 JSON 配置
   */
  async downloadJson<T = any>(params: OssDownloadParams): Promise<T | null> {
    const content = await this.download(params);
    if (!content) {
      return null;
    }
    try {
      return JSON.parse(content);
    } catch (error) {
      this.logger.error(`解析 JSON 失败: ${params.key}`, error.stack);
      throw new Error(`解析 JSON 失败: ${error.message}`);
    }
  }

  /**
   * 列出指定前缀的所有文件
   */
  async list(params: OssListParams): Promise<OssFileInfo[]> {
    try {
      const client = this.fileStorageService.getClient();
      const result = await client.list({
        prefix: params.prefix,
        'max-keys': params.maxKeys || 1000,
      });

      const files: OssFileInfo[] = (result.objects || []).map((obj: any) => ({
        key: obj.name,
        size: obj.size,
        lastModified: new Date(obj.lastModified),
      }));

      this.logger.log(`列出 OSS 文件: ${params.prefix}, 数量: ${files.length}`);
      return files;
    } catch (error) {
      this.logger.error(`列出 OSS 文件失败: ${params.prefix}`, error.stack);
      throw new Error(`列出 OSS 文件失败: ${error.message}`);
    }
  }

  /**
   * 复制文件（用于草稿发布）
   */
  async copy(sourceKey: string, targetKey: string): Promise<void> {
    try {
      const client = this.fileStorageService.getClient();
      await client.copy(targetKey, sourceKey);
      this.logger.log(`成功复制文件: ${sourceKey} -> ${targetKey}`);
    } catch (error) {
      this.logger.error(`复制文件失败: ${sourceKey} -> ${targetKey}`, error.stack);
      throw new Error(`复制文件失败: ${error.message}`);
    }
  }

  /**
   * 删除文件
   */
  async delete(key: string): Promise<void> {
    try {
      await this.fileStorageService.deleteFile(key);
      this.logger.log(`成功删除文件: ${key}`);
    } catch (error) {
      this.logger.error(`删除文件失败: ${key}`, error.stack);
      throw new Error(`删除文件失败: ${error.message}`);
    }
  }

  /**
   * 计算内容 MD5 哈希
   */
  calculateHash(content: string | Buffer): string {
    const data = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * 生成草稿路径的 OSS Key
   */
  generateDraftKey(
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
    scope: ConfigScope,
    tenant?: string,
  ): string {
    return this.generateOssKey({
      area: OssArea.DRAFT,
      moduleCode,
      versionCode,
      componentType,
      componentCode,
      scope,
      tenant,
    });
  }

  /**
   * 生成发布路径的 OSS Key
   */
  generatePublishedKey(
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
    scope: ConfigScope,
    tenant?: string,
  ): string {
    return this.generateOssKey({
      area: OssArea.PUBLISHED,
      moduleCode,
      versionCode,
      componentType,
      componentCode,
      scope,
      tenant,
    });
  }
}
