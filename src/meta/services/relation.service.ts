import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository, BaseRepository } from '@cs/nest-typeorm';
import { ContextService } from '@cs/nest-common';
import { RelationDefinitionEntity } from '../entities';
import { CreateRelationDto, UpdateRelationDto, IRelationDefinition } from '../../shared/interfaces';
import { ModelService } from './model.service';

/**
 * 关联仓储
 */
@Injectable()
export class RelationRepository extends BaseRepository<RelationDefinitionEntity> {}

/**
 * 关联定义服务
 */
@Injectable()
export class RelationService {
  constructor(
    @InjectRepository({
      entity: RelationDefinitionEntity,
      repository: RelationRepository,
    })
    private readonly relationRepository: RelationRepository,
    private readonly contextService: ContextService,
    private readonly modelService: ModelService,
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
   * 创建关联
   */
  async create(sourceModelId: string, dto: CreateRelationDto): Promise<RelationDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    // 获取源模型
    const sourceModel = await this.modelService.findById(sourceModelId);
    if (!sourceModel) {
      throw new NotFoundException(`源模型 ${sourceModelId} 不存在`);
    }

    // 获取目标模型
    const targetModel = await this.modelService.findByCode(dto.targetModelCode);
    if (!targetModel) {
      throw new NotFoundException(`目标模型 ${dto.targetModelCode} 不存在`);
    }

    // 检查关联代码是否已存在
    const existing = await this.relationRepository.findOne({
      sourceModelId,
      code: dto.code,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (existing) {
      throw new ConflictException(`关联代码 ${dto.code} 在该模型中已存在`);
    }

    const relation = new RelationDefinitionEntity();
    relation.code = dto.code;
    relation.name = dto.name;
    relation.description = dto.description;
    relation.sourceModelId = sourceModelId;
    relation.sourceModelCode = sourceModel.code;
    relation.targetModelId = targetModel.id;
    relation.targetModelCode = targetModel.code;
    relation.type = dto.type;
    relation.joinConfig = dto.joinConfig;
    relation.includeFields = dto.includeFields;
    relation.fieldAliases = dto.fieldAliases;
    relation.tenant = tenantCode;

    return this.relationRepository.saveOne(relation);
  }

  /**
   * 更新关联
   */
  async update(id: string, dto: UpdateRelationDto): Promise<RelationDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    const relation = await this.relationRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (!relation) {
      throw new NotFoundException(`关联 ${id} 不存在`);
    }

    // 如果更新目标模型，需要验证
    if (dto.targetModelCode && dto.targetModelCode !== relation.targetModelCode) {
      const targetModel = await this.modelService.findByCode(dto.targetModelCode);
      if (!targetModel) {
        throw new NotFoundException(`目标模型 ${dto.targetModelCode} 不存在`);
      }
      relation.targetModelId = targetModel.id;
      relation.targetModelCode = targetModel.code;
    }

    if (dto.code !== undefined) relation.code = dto.code;
    if (dto.name !== undefined) relation.name = dto.name;
    if (dto.description !== undefined) relation.description = dto.description;
    if (dto.type !== undefined) relation.type = dto.type;
    if (dto.joinConfig !== undefined) relation.joinConfig = dto.joinConfig;
    if (dto.includeFields !== undefined) relation.includeFields = dto.includeFields;
    if (dto.fieldAliases !== undefined) relation.fieldAliases = dto.fieldAliases;

    return this.relationRepository.saveOne(relation);
  }

  /**
   * 根据 ID 获取关联
   */
  async findById(id: string): Promise<RelationDefinitionEntity | null> {
    const tenantCode = this.getTenantCode();
    return this.relationRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });
  }

  /**
   * 获取模型的所有关联
   */
  async findByModelId(modelId: string): Promise<RelationDefinitionEntity[]> {
    const tenantCode = this.getTenantCode();
    return this.relationRepository.findMany({
      sourceModelId: modelId,
      tenant: tenantCode,
      isRemoved: false,
    });
  }

  /**
   * 根据模型代码获取关联
   */
  async findByModelCode(modelCode: string): Promise<RelationDefinitionEntity[]> {
    const tenantCode = this.getTenantCode();
    return this.relationRepository.findMany({
      sourceModelCode: modelCode,
      tenant: tenantCode,
      isRemoved: false,
    });
  }

  /**
   * 删除关联（软删除）
   */
  async delete(id: string): Promise<void> {
    const tenantCode = this.getTenantCode();

    const result = await this.relationRepository.softDeletion({
      id,
      tenant: tenantCode,
    });

    if (result.affected === 0) {
      throw new NotFoundException(`关联 ${id} 不存在`);
    }
  }

  /**
   * 删除模型的所有关联
   */
  async deleteByModelId(modelId: string): Promise<void> {
    const tenantCode = this.getTenantCode();
    await this.relationRepository.softDeletion({
      sourceModelId: modelId,
      tenant: tenantCode,
    });
  }
}
