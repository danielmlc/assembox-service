import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RedisService } from '@cs/nest-redis';
import { ContextService } from '@cs/nest-common';
import { ModelService } from './model.service';
import { FieldService } from './field.service';
import { RelationService } from './relation.service';
import { ActionService } from './action.service';
import { ModelDefinitionEntity, FieldDefinitionEntity, RelationDefinitionEntity, ActionDefinitionEntity } from '../entities';
import { CACHE_PREFIX, CACHE_TTL } from '../../shared/constants/aseembox.constants';
import { RuntimeModelDefinition } from '../../shared/interfaces';

/**
 * 元数据缓存服务
 * 实现二级缓存：本地内存 + Redis
 */
@Injectable()
export class MetaCacheService {
  private readonly logger = new Logger(MetaCacheService.name);

  // L1 缓存：本地内存
  private readonly modelCache = new Map<string, ModelDefinitionEntity>();
  private readonly fieldsCache = new Map<string, FieldDefinitionEntity[]>();
  private readonly relationsCache = new Map<string, RelationDefinitionEntity[]>();
  private readonly actionsCache = new Map<string, ActionDefinitionEntity[]>();
  private readonly runtimeModelCache = new Map<string, RuntimeModelDefinition>();

  constructor(
    private readonly redisService: RedisService,
    private readonly contextService: ContextService,
    private readonly modelService: ModelService,
    private readonly fieldService: FieldService,
    private readonly relationService: RelationService,
    private readonly actionService: ActionService,
  ) {}

  /**
   * 获取当前租户
   */
  private getTenantCode(): string {
    const tenantCode = this.contextService.getContext<string>('tenantCode');
    if (!tenantCode) {
      throw new Error('租户信息缺失');
    }
    return tenantCode;
  }

  /**
   * 生成缓存 Key
   */
  private getCacheKey(prefix: string, identifier: string): string {
    const tenantCode = this.getTenantCode();
    return `${prefix}:${tenantCode}:${identifier}`;
  }

  /**
   * 获取 Redis 客户端
   */
  private getRedis() {
    return this.redisService.getRedis();
  }

  // ==================== 模型缓存 ====================

  /**
   * 根据代码获取模型定义
   */
  async getModel(modelCode: string): Promise<ModelDefinitionEntity> {
    const cacheKey = this.getCacheKey(CACHE_PREFIX.MODEL, modelCode);

    // L1: 本地内存
    if (this.modelCache.has(cacheKey)) {
      this.logger.debug(`Model cache hit (L1): ${modelCode}`);
      return this.modelCache.get(cacheKey)!;
    }

    // L2: Redis
    const redis = this.getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Model cache hit (L2): ${modelCode}`);
      const model = JSON.parse(cached) as ModelDefinitionEntity;
      this.modelCache.set(cacheKey, model);
      return model;
    }

    // L3: 数据库
    this.logger.debug(`Model cache miss, loading from DB: ${modelCode}`);
    const model = await this.modelService.findByCode(modelCode);
    if (!model) {
      throw new NotFoundException(`模型 ${modelCode} 不存在`);
    }

    // 写入缓存
    this.modelCache.set(cacheKey, model);
    await redis.set(cacheKey, JSON.stringify(model), 'EX', CACHE_TTL.MODEL);

    return model;
  }

  /**
   * 根据 ID 获取模型定义
   */
  async getModelById(modelId: string): Promise<ModelDefinitionEntity> {
    const cacheKey = this.getCacheKey(CACHE_PREFIX.MODEL, `id:${modelId}`);

    // L1: 本地内存
    if (this.modelCache.has(cacheKey)) {
      return this.modelCache.get(cacheKey)!;
    }

    // L2: Redis
    const redis = this.getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      const model = JSON.parse(cached) as ModelDefinitionEntity;
      this.modelCache.set(cacheKey, model);
      return model;
    }

    // L3: 数据库
    const model = await this.modelService.findById(modelId);
    if (!model) {
      throw new NotFoundException(`模型 ${modelId} 不存在`);
    }

    // 写入缓存
    this.modelCache.set(cacheKey, model);
    await redis.set(cacheKey, JSON.stringify(model), 'EX', CACHE_TTL.MODEL);

    return model;
  }

  // ==================== 字段缓存 ====================

  /**
   * 获取模型的所有字段
   */
  async getFields(modelId: string): Promise<FieldDefinitionEntity[]> {
    const cacheKey = this.getCacheKey(CACHE_PREFIX.FIELD, modelId);

    // L1: 本地内存
    if (this.fieldsCache.has(cacheKey)) {
      this.logger.debug(`Fields cache hit (L1): ${modelId}`);
      return this.fieldsCache.get(cacheKey)!;
    }

    // L2: Redis
    const redis = this.getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Fields cache hit (L2): ${modelId}`);
      const fields = JSON.parse(cached) as FieldDefinitionEntity[];
      this.fieldsCache.set(cacheKey, fields);
      return fields;
    }

    // L3: 数据库
    this.logger.debug(`Fields cache miss, loading from DB: ${modelId}`);
    const fields = await this.fieldService.findByModelId(modelId);

    // 写入缓存
    this.fieldsCache.set(cacheKey, fields);
    await redis.set(cacheKey, JSON.stringify(fields), 'EX', CACHE_TTL.FIELD);

    return fields;
  }

  /**
   * 根据模型代码获取字段
   */
  async getFieldsByModelCode(modelCode: string): Promise<FieldDefinitionEntity[]> {
    const model = await this.getModel(modelCode);
    return this.getFields(model.id);
  }

  // ==================== 关联缓存 ====================

  /**
   * 获取模型的所有关联
   */
  async getRelations(modelId: string): Promise<RelationDefinitionEntity[]> {
    const cacheKey = this.getCacheKey(CACHE_PREFIX.RELATION, modelId);

    // L1: 本地内存
    if (this.relationsCache.has(cacheKey)) {
      this.logger.debug(`Relations cache hit (L1): ${modelId}`);
      return this.relationsCache.get(cacheKey)!;
    }

    // L2: Redis
    const redis = this.getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Relations cache hit (L2): ${modelId}`);
      const relations = JSON.parse(cached) as RelationDefinitionEntity[];
      this.relationsCache.set(cacheKey, relations);
      return relations;
    }

    // L3: 数据库
    this.logger.debug(`Relations cache miss, loading from DB: ${modelId}`);
    const relations = await this.relationService.findByModelId(modelId);

    // 写入缓存
    this.relationsCache.set(cacheKey, relations);
    await redis.set(cacheKey, JSON.stringify(relations), 'EX', CACHE_TTL.RELATION);

    return relations;
  }

  /**
   * 根据模型代码获取关联
   */
  async getRelationsByModelCode(modelCode: string): Promise<RelationDefinitionEntity[]> {
    const model = await this.getModel(modelCode);
    return this.getRelations(model.id);
  }

  // ==================== 操作缓存 ====================

  /**
   * 获取模型的所有操作
   */
  async getActions(modelId: string): Promise<ActionDefinitionEntity[]> {
    const cacheKey = this.getCacheKey(CACHE_PREFIX.ACTION, modelId);

    // L1: 本地内存
    if (this.actionsCache.has(cacheKey)) {
      this.logger.debug(`Actions cache hit (L1): ${modelId}`);
      return this.actionsCache.get(cacheKey)!;
    }

    // L2: Redis
    const redis = this.getRedis();
    const cached = await redis.get(cacheKey);
    if (cached) {
      this.logger.debug(`Actions cache hit (L2): ${modelId}`);
      const actions = JSON.parse(cached) as ActionDefinitionEntity[];
      this.actionsCache.set(cacheKey, actions);
      return actions;
    }

    // L3: 数据库
    this.logger.debug(`Actions cache miss, loading from DB: ${modelId}`);
    const actions = await this.actionService.findByModelId(modelId);

    // 写入缓存
    this.actionsCache.set(cacheKey, actions);
    await redis.set(cacheKey, JSON.stringify(actions), 'EX', CACHE_TTL.ACTION);

    return actions;
  }

  /**
   * 根据模型代码和操作代码获取操作
   */
  async getAction(modelCode: string, actionCode: string): Promise<ActionDefinitionEntity | null> {
    const model = await this.getModel(modelCode);
    const actions = await this.getActions(model.id);
    return actions.find(a => a.code === actionCode) || null;
  }

  // ==================== 运行时模型（聚合） ====================

  /**
   * 获取完整的运行时模型定义（包含字段、关联、操作）
   */
  async getRuntimeModel(modelCode: string): Promise<RuntimeModelDefinition> {
    const cacheKey = this.getCacheKey('runtime', modelCode);

    // L1: 本地内存
    if (this.runtimeModelCache.has(cacheKey)) {
      this.logger.debug(`Runtime model cache hit (L1): ${modelCode}`);
      return this.runtimeModelCache.get(cacheKey)!;
    }

    // 加载各部分
    const model = await this.getModel(modelCode);
    const [fields, relations, actions] = await Promise.all([
      this.getFields(model.id),
      this.getRelations(model.id),
      this.getActions(model.id),
    ]);

    const runtimeModel: RuntimeModelDefinition = {
      model,
      fields,
      relations,
      actions,
    };

    // 只缓存到 L1（聚合数据不写 Redis，避免数据不一致）
    this.runtimeModelCache.set(cacheKey, runtimeModel);

    return runtimeModel;
  }

  // ==================== 缓存失效 ====================

  /**
   * 清除模型缓存
   */
  async invalidateModel(modelCode: string): Promise<void> {
    const cacheKey = this.getCacheKey(CACHE_PREFIX.MODEL, modelCode);

    // 清除 L1
    this.modelCache.delete(cacheKey);

    // 清除 L2
    const redis = this.getRedis();
    await redis.del(cacheKey);

    // 清除运行时缓存
    const runtimeKey = this.getCacheKey('runtime', modelCode);
    this.runtimeModelCache.delete(runtimeKey);

    this.logger.debug(`Model cache invalidated: ${modelCode}`);
  }

  /**
   * 清除模型相关的所有缓存（包括字段、关联、操作）
   */
  async invalidateModelFull(modelId: string, modelCode: string): Promise<void> {
    const redis = this.getRedis();
    const tenantCode = this.getTenantCode();

    // 清除模型缓存
    const modelKey = this.getCacheKey(CACHE_PREFIX.MODEL, modelCode);
    const modelIdKey = this.getCacheKey(CACHE_PREFIX.MODEL, `id:${modelId}`);
    this.modelCache.delete(modelKey);
    this.modelCache.delete(modelIdKey);
    await redis.del(modelKey, modelIdKey);

    // 清除字段缓存
    const fieldsKey = this.getCacheKey(CACHE_PREFIX.FIELD, modelId);
    this.fieldsCache.delete(fieldsKey);
    await redis.del(fieldsKey);

    // 清除关联缓存
    const relationsKey = this.getCacheKey(CACHE_PREFIX.RELATION, modelId);
    this.relationsCache.delete(relationsKey);
    await redis.del(relationsKey);

    // 清除操作缓存
    const actionsKey = this.getCacheKey(CACHE_PREFIX.ACTION, modelId);
    this.actionsCache.delete(actionsKey);
    await redis.del(actionsKey);

    // 清除运行时缓存
    const runtimeKey = this.getCacheKey('runtime', modelCode);
    this.runtimeModelCache.delete(runtimeKey);

    this.logger.debug(`Full model cache invalidated: ${modelCode} (${modelId})`);
  }

  /**
   * 清除字段缓存
   */
  async invalidateFields(modelId: string): Promise<void> {
    const cacheKey = this.getCacheKey(CACHE_PREFIX.FIELD, modelId);

    this.fieldsCache.delete(cacheKey);

    const redis = this.getRedis();
    await redis.del(cacheKey);

    // 同时清除关联的运行时缓存
    // 需要通过 modelId 找到 modelCode
    try {
      const model = await this.getModelById(modelId);
      const runtimeKey = this.getCacheKey('runtime', model.code);
      this.runtimeModelCache.delete(runtimeKey);
    } catch {
      // 模型可能已被删除，忽略
    }

    this.logger.debug(`Fields cache invalidated: ${modelId}`);
  }

  /**
   * 清除关联缓存
   */
  async invalidateRelations(modelId: string): Promise<void> {
    const cacheKey = this.getCacheKey(CACHE_PREFIX.RELATION, modelId);

    this.relationsCache.delete(cacheKey);

    const redis = this.getRedis();
    await redis.del(cacheKey);

    this.logger.debug(`Relations cache invalidated: ${modelId}`);
  }

  /**
   * 清除操作缓存
   */
  async invalidateActions(modelId: string): Promise<void> {
    const cacheKey = this.getCacheKey(CACHE_PREFIX.ACTION, modelId);

    this.actionsCache.delete(cacheKey);

    const redis = this.getRedis();
    await redis.del(cacheKey);

    this.logger.debug(`Actions cache invalidated: ${modelId}`);
  }

  /**
   * 清除当前租户的所有缓存
   */
  async invalidateAll(): Promise<void> {
    const tenantCode = this.getTenantCode();

    // 清除 L1 中该租户的所有缓存
    for (const key of this.modelCache.keys()) {
      if (key.includes(`:${tenantCode}:`)) {
        this.modelCache.delete(key);
      }
    }
    for (const key of this.fieldsCache.keys()) {
      if (key.includes(`:${tenantCode}:`)) {
        this.fieldsCache.delete(key);
      }
    }
    for (const key of this.relationsCache.keys()) {
      if (key.includes(`:${tenantCode}:`)) {
        this.relationsCache.delete(key);
      }
    }
    for (const key of this.actionsCache.keys()) {
      if (key.includes(`:${tenantCode}:`)) {
        this.actionsCache.delete(key);
      }
    }
    for (const key of this.runtimeModelCache.keys()) {
      if (key.includes(`:${tenantCode}:`)) {
        this.runtimeModelCache.delete(key);
      }
    }

    // 清除 L2 中该租户的所有缓存（使用 SCAN 避免阻塞）
    const redis = this.getRedis();
    const patterns = [
      `${CACHE_PREFIX.MODEL}:${tenantCode}:*`,
      `${CACHE_PREFIX.FIELD}:${tenantCode}:*`,
      `${CACHE_PREFIX.RELATION}:${tenantCode}:*`,
      `${CACHE_PREFIX.ACTION}:${tenantCode}:*`,
    ];

    for (const pattern of patterns) {
      let cursor = '0';
      do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } while (cursor !== '0');
    }

    this.logger.debug(`All cache invalidated for tenant: ${tenantCode}`);
  }
}
