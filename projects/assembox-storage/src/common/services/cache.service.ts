import { RedisService } from '@cs/nest-redis';
import { Injectable, Logger } from '@nestjs/common';

import { REDIS_PREFIX, CACHE_TTL } from '../constants';
import { ConfigScope } from '../entities';

/**
 * 缓存服务
 * 实现三层缓存策略
 */
@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redisService: RedisService) { }

  /**
   * L1: 租户配置缓存键 (继承查找结果)
   * Key: assembox:config:{tenant}:{module}:{version}:{type}:{code}
   */
  private buildConfigCacheKey (
    tenant: string,
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
  ): string {
    return `${REDIS_PREFIX.CONFIG}:${tenant}:${moduleCode}:${versionCode}:${componentType}:${componentCode}`;
  }

  /**
   * L2: 原始配置缓存键
   * Key: assembox:raw:{scope}:{module}:{version}:{type}:{code}
   */
  private buildRawCacheKey (
    scope: ConfigScope,
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
    tenant?: string,
  ): string {
    const scopeKey =
      scope === ConfigScope.TENANT ? `${scope}:${tenant}` : scope;
    return `${REDIS_PREFIX.RAW}:${scopeKey}:${moduleCode}:${versionCode}:${componentType}:${componentCode}`;
  }

  /**
   * L3: 组件列表缓存键
   * Key: assembox:components:{module}:{version}:{category}
   */
  private buildComponentsCacheKey (
    moduleCode: string,
    versionCode: string,
    category?: string,
  ): string {
    const suffix = category || 'all';
    return `${REDIS_PREFIX.COMPONENTS}:${moduleCode}:${versionCode}:${suffix}`;
  }

  /**
   * 获取配置缓存 (L1)
   */
  async getConfig<T = any> (
    tenant: string,
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
  ): Promise<T | null> {
    const key = this.buildConfigCacheKey(
      tenant,
      moduleCode,
      versionCode,
      componentType,
      componentCode,
    );
    const cached = await this.redisService.getRedis().get(key);
    if (cached) {
      this.logger.debug(`命中L1缓存: ${key}`);
      return JSON.parse(cached);
    }
    return null;
  }

  /**
   * 设置配置缓存 (L1)
   */
  async setConfig (
    tenant: string,
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
    data: any,
  ): Promise<void> {
    const key = this.buildConfigCacheKey(
      tenant,
      moduleCode,
      versionCode,
      componentType,
      componentCode,
    );
    await this.redisService.getRedis().setex(
      key,
      CACHE_TTL.CONFIG,
      JSON.stringify(data),
    );
    this.logger.debug(`设置L1缓存: ${key}`);
  }

  /**
   * 获取原始配置缓存 (L2)
   */
  async getRawConfig<T = any> (
    scope: ConfigScope,
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
    tenant?: string,
  ): Promise<T | null> {
    const key = this.buildRawCacheKey(
      scope,
      moduleCode,
      versionCode,
      componentType,
      componentCode,
      tenant,
    );
    const cached = await this.redisService.getRedis().get(key);
    if (cached) {
      this.logger.debug(`命中L2缓存: ${key}`);
      return JSON.parse(cached);
    }
    return null;
  }

  /**
   * 设置原始配置缓存 (L2)
   */
  async setRawConfig (
    scope: ConfigScope,
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
    data: any,
    tenant?: string,
  ): Promise<void> {
    const key = this.buildRawCacheKey(
      scope,
      moduleCode,
      versionCode,
      componentType,
      componentCode,
      tenant,
    );
    await this.redisService.getRedis().setex(key, CACHE_TTL.RAW, JSON.stringify(data));
    this.logger.debug(`设置L2缓存: ${key}`);
  }

  /**
   * 获取组件列表缓存 (L3)
   */
  async getComponents<T = any> (
    moduleCode: string,
    versionCode: string,
    category?: string,
  ): Promise<T[] | null> {
    const key = this.buildComponentsCacheKey(moduleCode, versionCode, category);
    const cached = await this.redisService.getRedis().get(key);
    if (cached) {
      this.logger.debug(`命中L3缓存: ${key}`);
      return JSON.parse(cached);
    }
    return null;
  }

  /**
   * 设置组件列表缓存 (L3)
   */
  async setComponents (
    moduleCode: string,
    versionCode: string,
    data: any[],
    category?: string,
  ): Promise<void> {
    const key = this.buildComponentsCacheKey(moduleCode, versionCode, category);
    await this.redisService.getRedis().setex(
      key,
      CACHE_TTL.COMPONENTS,
      JSON.stringify(data),
    );
    this.logger.debug(`设置L3缓存: ${key}`);
  }

  /**
   * 清除配置缓存
   * 用于发布配置时清除相关缓存
   */
  async clearConfigCache (
    moduleCode: string,
    versionCode: string,
    componentType: string,
    componentCode: string,
    scope: ConfigScope,
    tenant?: string,
  ): Promise<void> {
    // 清除 L1 缓存
    if (scope === ConfigScope.SYSTEM || scope === ConfigScope.GLOBAL) {
      // 系统层或全局层配置变更，需要清除所有租户的缓存
      // 这里使用模式匹配删除
      const pattern = `${REDIS_PREFIX.CONFIG}:*:${moduleCode}:${versionCode}:${componentType}:${componentCode}`;
      await this.deleteByPattern(pattern);
    } else if (scope === ConfigScope.TENANT && tenant) {
      // 租户层配置变更，只清除该租户的缓存
      const key = this.buildConfigCacheKey(
        tenant,
        moduleCode,
        versionCode,
        componentType,
        componentCode,
      );
      await this.redisService.getRedis().del(key);
    }

    // 清除 L2 缓存
    const rawKey = this.buildRawCacheKey(
      scope,
      moduleCode,
      versionCode,
      componentType,
      componentCode,
      tenant,
    );
    await this.redisService.getRedis().del(rawKey);

    this.logger.log(
      `清除缓存: ${moduleCode}/${versionCode}/${componentType}/${componentCode} [${scope}]`,
    );
  }

  /**
   * 清除组件列表缓存
   */
  async clearComponentsCache (
    moduleCode: string,
    versionCode: string,
  ): Promise<void> {
    const pattern = `${REDIS_PREFIX.COMPONENTS}:${moduleCode}:${versionCode}:*`;
    await this.deleteByPattern(pattern);
    this.logger.log(`清除组件列表缓存: ${moduleCode}/${versionCode}`);
  }

  /**
   * 清除模块的所有缓存
   */
  async clearModuleCache (moduleCode: string): Promise<void> {
    const patterns = [
      `${REDIS_PREFIX.CONFIG}:*:${moduleCode}:*`,
      `${REDIS_PREFIX.RAW}:*:${moduleCode}:*`,
      `${REDIS_PREFIX.COMPONENTS}:${moduleCode}:*`,
    ];

    for (const pattern of patterns) {
      await this.deleteByPattern(pattern);
    }

    this.logger.log(`清除模块缓存: ${moduleCode}`);
  }

  /**
   * 根据模式删除键
   */
  private async deleteByPattern (pattern: string): Promise<void> {
    try {
      const keys = await this.redisService.getRedis().keys(pattern);
      if (keys && keys.length > 0) {
        await this.redisService.getRedis().del(...keys);
        this.logger.debug(`删除 ${keys.length} 个缓存键: ${pattern}`);
      }
    } catch (error) {
      this.logger.error(`删除缓存失败: ${pattern}`, error.stack);
      // 不抛出异常，避免影响主流程
    }
  }
}
