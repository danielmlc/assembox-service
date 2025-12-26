import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository, BaseRepository } from '@cs/nest-typeorm';
import { ContextService } from '@cs/nest-common';
import { RpcClient } from '@cs/nest-cloud';
import { ModelDefinitionEntity } from '../entities';
import {
  CreateModelDto,
  UpdateModelDto,
  IModelDefinition,
  ModelConfig,
} from '../../shared/interfaces';
import { ModelStatus, CacheStrategy } from '../../shared/constants/aseembox.constants';

/**
 * 模型仓储
 */
@Injectable()
export class ModelRepository extends BaseRepository<ModelDefinitionEntity> {}

/**
 * 模型定义服务
 */
@Injectable()
export class ModelService {
  constructor(
    @InjectRepository({
      entity: ModelDefinitionEntity,
      repository: ModelRepository,
    })
    private readonly modelRepository: ModelRepository,
    private readonly contextService: ContextService,
    private readonly rpcClient: RpcClient,
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
   * 默认模型配置
   */
  private getDefaultConfig(): ModelConfig {
    return {
      enableSoftDelete: true,
      enableVersion: true,
      enableAudit: true,
      enableTenant: true,
      cacheStrategy: CacheStrategy.READ,
      cacheTTL: 3600,
    };
  }

  /**
   * 创建模型
   */
  async create(dto: CreateModelDto): Promise<ModelDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    // 检查模型代码是否已存在
    const existing = await this.modelRepository.findOne({
      code: dto.code,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (existing) {
      throw new ConflictException(`模型代码 ${dto.code} 已存在`);
    }

    const model = new ModelDefinitionEntity();
    model.code = dto.code;
    model.name = dto.name;
    model.description = dto.description;
    model.tableName = dto.tableName;
    model.databaseName = dto.databaseName;
    model.config = { ...this.getDefaultConfig(), ...dto.config };
    model.indexes = dto.indexes;
    model.status = ModelStatus.DRAFT;
    model.versionNum = 1;
    model.tenant = tenantCode;

    return this.modelRepository.saveOne(model);
  }

  /**
   * 更新模型
   */
  async update(id: string, dto: UpdateModelDto): Promise<ModelDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    const model = await this.modelRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (!model) {
      throw new NotFoundException(`模型 ${id} 不存在`);
    }

    if (dto.name !== undefined) model.name = dto.name;
    if (dto.description !== undefined) model.description = dto.description;
    if (dto.config) model.config = { ...model.config, ...dto.config };
    if (dto.indexes) model.indexes = dto.indexes;

    return this.modelRepository.saveOne(model);
  }

  /**
   * 根据 ID 获取模型
   */
  async findById(id: string): Promise<ModelDefinitionEntity | null> {
    const tenantCode = this.getTenantCode();
    return this.modelRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });
  }

  /**
   * 根据代码获取模型
   */
  async findByCode(code: string, tenantCode?: string): Promise<ModelDefinitionEntity | null> {
    const tenant = tenantCode || this.getTenantCode();
    return this.modelRepository.findOne({
      code,
      tenant,
      isRemoved: false,
    });
  }

  /**
   * 获取已发布的模型
   */
  async findPublishedByCode(code: string, tenantCode?: string): Promise<ModelDefinitionEntity | null> {
    const tenant = tenantCode || this.getTenantCode();
    return this.modelRepository.findOne({
      code,
      tenant,
      status: ModelStatus.PUBLISHED,
      isRemoved: false,
    });
  }

  /**
   * 获取模型列表
   */
  async findAll(status?: ModelStatus): Promise<ModelDefinitionEntity[]> {
    const tenantCode = this.getTenantCode();
    const conditions: any = {
      tenant: tenantCode,
      isRemoved: false,
    };
    if (status) {
      conditions.status = status;
    }
    return this.modelRepository.findMany(conditions);
  }

  /**
   * 发布模型
   */
  async publish(id: string): Promise<ModelDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    const model = await this.modelRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (!model) {
      throw new NotFoundException(`模型 ${id} 不存在`);
    }

    model.status = ModelStatus.PUBLISHED;
    model.publishedAt = new Date();
    model.versionNum += 1;

    return this.modelRepository.saveOne(model);
  }

  /**
   * 废弃模型
   */
  async deprecate(id: string): Promise<ModelDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    const model = await this.modelRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (!model) {
      throw new NotFoundException(`模型 ${id} 不存在`);
    }

    model.status = ModelStatus.DEPRECATED;

    return this.modelRepository.saveOne(model);
  }

  /**
   * 删除模型（软删除）
   */
  async delete(id: string): Promise<void> {
    const tenantCode = this.getTenantCode();

    const result = await this.modelRepository.softDeletion({
      id,
      tenant: tenantCode,
    });

    if (result.affected === 0) {
      throw new NotFoundException(`模型 ${id} 不存在`);
    }
  }
}
