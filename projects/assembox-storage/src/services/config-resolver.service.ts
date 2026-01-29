import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ComponentRepository, ConfigRepository } from '../repositories';
import { ConfigScope, ConfigStatus } from '../entities';
import { LoadContext, ComponentMeta, ConfigResult } from '../interfaces';
import { OssService } from './oss.service';
import { CacheService } from './cache.service';

/**
 * 配置解析服务
 * 实现配置继承查找逻辑
 */
@Injectable()
export class ConfigResolverService {
  private readonly logger = new Logger(ConfigResolverService.name);

  constructor(
    private readonly componentRepository: ComponentRepository,
    private readonly configRepository: ConfigRepository,
    private readonly ossService: OssService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 加载配置（核心方法）
   * 根据组件的 is_inheritable 和 is_cacheable 特性决定查找和缓存策略
   */
  async loadConfig(ctx: LoadContext): Promise<ConfigResult> {
    // 1. 获取组件元信息
    const component = await this.getComponentMeta(ctx);
    if (!component) {
      throw new NotFoundException(
        `组件不存在: ${ctx.componentType}/${ctx.componentCode}`,
      );
    }

    // 2. 根据缓存特性决定是否查缓存
    if (component.isCacheable) {
      const cached = await this.cacheService.getConfig(
        ctx.tenant,
        ctx.moduleCode,
        ctx.versionCode,
        ctx.componentType,
        ctx.componentCode,
      );
      if (cached) {
        this.logger.debug(`从缓存加载配置: ${this.buildLogKey(ctx)}`);
        return cached;
      }
    }

    // 3. 根据继承特性决定查找范围
    let result: ConfigResult | null;
    if (component.isInheritable) {
      // 支持继承：按优先级查找 (tenant > global > system)
      result = await this.loadConfigWithInheritance(ctx, component);
    } else {
      // 不支持继承：只查 system 层
      result = await this.loadSystemOnlyConfig(ctx, component);
    }

    if (!result) {
      throw new NotFoundException(
        `配置不存在: ${this.buildLogKey(ctx)}`,
      );
    }

    // 4. 根据缓存特性决定是否写缓存
    if (component.isCacheable) {
      await this.cacheService.setConfig(
        ctx.tenant,
        ctx.moduleCode,
        ctx.versionCode,
        ctx.componentType,
        ctx.componentCode,
        result,
      );
    }

    this.logger.log(`加载配置成功: ${this.buildLogKey(ctx)} [${result.scope}]`);
    return result;
  }

  /**
   * 支持继承的配置加载
   * 按优先级查找: tenant > global > system
   */
  private async loadConfigWithInheritance(
    ctx: LoadContext,
    component: ComponentMeta,
  ): Promise<ConfigResult | null> {
    // 优先级1: 租户层
    const tenantConfig = await this.loadConfigFromScope(
      ctx,
      ConfigScope.TENANT,
      ctx.tenant,
    );
    if (tenantConfig) {
      return tenantConfig;
    }

    // 优先级2: 全局层
    const globalConfig = await this.loadConfigFromScope(
      ctx,
      ConfigScope.GLOBAL,
    );
    if (globalConfig) {
      return globalConfig;
    }

    // 优先级3: 系统层（必须存在）
    const systemConfig = await this.loadConfigFromScope(
      ctx,
      ConfigScope.SYSTEM,
    );
    return systemConfig;
  }

  /**
   * 仅系统层的配置加载
   * 用于 is_inheritable=0 的组件
   */
  private async loadSystemOnlyConfig(
    ctx: LoadContext,
    component: ComponentMeta,
  ): Promise<ConfigResult | null> {
    return this.loadConfigFromScope(ctx, ConfigScope.SYSTEM);
  }

  /**
   * 从指定 scope 加载配置
   * 只查询 status=published 的配置
   * OSS 读取 published 路径
   */
  private async loadConfigFromScope(
    ctx: LoadContext,
    scope: ConfigScope,
    tenant?: string,
  ): Promise<ConfigResult | null> {
    try {
      // 从 TiDB 查询配置索引（只查 published 状态）
      const configIndex =
        await this.configRepository.findPublishedByFullKey(
          ctx.moduleCode,
          ctx.versionCode,
          ctx.componentType,
          ctx.componentCode,
          scope,
          tenant,
        );

      if (!configIndex) {
        this.logger.debug(
          `配置不存在 [${scope}]: ${this.buildLogKey(ctx)}`,
        );
        return null;
      }

      // 从 OSS published 路径读取内容
      const content = await this.ossService.downloadJson(
        { key: configIndex.ossKey },
      );

      if (!content) {
        this.logger.warn(
          `OSS内容不存在: ${configIndex.ossKey}`,
        );
        return null;
      }

      return {
        config: content,
        scope,
        tenant,
        ossKey: configIndex.ossKey,
        publishVersion: configIndex.publishVersion,
      };
    } catch (error) {
      this.logger.error(
        `加载配置失败 [${scope}]: ${this.buildLogKey(ctx)}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * 获取组件元信息
   */
  private async getComponentMeta(
    ctx: LoadContext,
  ): Promise<ComponentMeta | null> {
    const component = await this.componentRepository.findByFullKey(
      ctx.moduleCode,
      ctx.versionCode,
      ctx.componentType,
      ctx.componentCode,
    );

    if (!component) {
      return null;
    }

    return {
      id: component.id,
      componentCode: component.componentCode,
      componentName: component.componentName,
      componentType: component.componentType,
      category: component.category,
      isInheritable: component.isInheritable,
      isCacheable: component.isCacheable,
    };
  }

  /**
   * 批量加载配置
   * 用于一次性加载多个组件的配置
   */
  async batchLoadConfigs(
    tenant: string,
    moduleCode: string,
    versionCode: string,
    componentCodes: Array<{ type: string; code: string }>,
  ): Promise<Map<string, ConfigResult>> {
    const results = new Map<string, ConfigResult>();

    for (const { type, code } of componentCodes) {
      try {
        const config = await this.loadConfig({
          tenant,
          moduleCode,
          versionCode,
          componentType: type,
          componentCode: code,
        });
        results.set(`${type}:${code}`, config);
      } catch (error) {
        this.logger.warn(
          `批量加载配置失败: ${moduleCode}/${versionCode}/${type}/${code}`,
          error.message,
        );
        // 继续加载其他配置，不中断
      }
    }

    return results;
  }

  /**
   * 构建日志键
   */
  private buildLogKey(ctx: LoadContext): string {
    return `${ctx.moduleCode}/${ctx.versionCode}/${ctx.componentType}/${ctx.componentCode} [tenant: ${ctx.tenant}]`;
  }
}
