import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository, BaseRepository } from '@cs/nest-typeorm';
import { ContextService } from '@cs/nest-common';
import { FieldDefinitionEntity } from '../entities';
import { CreateFieldDto, UpdateFieldDto, IFieldDefinition } from '../../shared/interfaces';

/**
 * 字段仓储
 */
@Injectable()
export class FieldRepository extends BaseRepository<FieldDefinitionEntity> {}

/**
 * 字段定义服务
 */
@Injectable()
export class FieldService {
  constructor(
    @InjectRepository({
      entity: FieldDefinitionEntity,
      repository: FieldRepository,
    })
    private readonly fieldRepository: FieldRepository,
    private readonly contextService: ContextService,
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
   * 创建字段
   */
  async create(modelId: string, dto: CreateFieldDto): Promise<FieldDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    // 检查字段代码是否已存在
    const existing = await this.fieldRepository.findOne({
      modelId,
      code: dto.code,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (existing) {
      throw new ConflictException(`字段代码 ${dto.code} 在该模型中已存在`);
    }

    const field = new FieldDefinitionEntity();
    field.modelId = modelId;
    field.code = dto.code;
    field.name = dto.name;
    field.description = dto.description;
    field.type = dto.type;
    field.dbType = dto.dbType;
    field.constraints = dto.constraints;
    field.validations = dto.validations;
    field.ui = dto.ui;
    field.computed = dto.computed;
    field.sortOrder = dto.sortOrder || 0;
    field.tenant = tenantCode;

    return this.fieldRepository.saveOne(field);
  }

  /**
   * 批量创建字段
   */
  async createMany(modelId: string, dtos: CreateFieldDto[]): Promise<FieldDefinitionEntity[]> {
    const tenantCode = this.getTenantCode();

    const fields = dtos.map((dto, index) => {
      const field = new FieldDefinitionEntity();
      field.modelId = modelId;
      field.code = dto.code;
      field.name = dto.name;
      field.description = dto.description;
      field.type = dto.type;
      field.dbType = dto.dbType;
      field.constraints = dto.constraints;
      field.validations = dto.validations;
      field.ui = dto.ui;
      field.computed = dto.computed;
      field.sortOrder = dto.sortOrder ?? index;
      field.tenant = tenantCode;
      return field;
    });

    return this.fieldRepository.saveMany(fields);
  }

  /**
   * 更新字段
   */
  async update(id: string, dto: UpdateFieldDto): Promise<FieldDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    const field = await this.fieldRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (!field) {
      throw new NotFoundException(`字段 ${id} 不存在`);
    }

    if (dto.code !== undefined) field.code = dto.code;
    if (dto.name !== undefined) field.name = dto.name;
    if (dto.description !== undefined) field.description = dto.description;
    if (dto.type !== undefined) field.type = dto.type;
    if (dto.dbType !== undefined) field.dbType = dto.dbType;
    if (dto.constraints !== undefined) field.constraints = dto.constraints;
    if (dto.validations !== undefined) field.validations = dto.validations;
    if (dto.ui !== undefined) field.ui = dto.ui;
    if (dto.computed !== undefined) field.computed = dto.computed;
    if (dto.sortOrder !== undefined) field.sortOrder = dto.sortOrder;

    return this.fieldRepository.saveOne(field);
  }

  /**
   * 根据 ID 获取字段
   */
  async findById(id: string): Promise<FieldDefinitionEntity | null> {
    const tenantCode = this.getTenantCode();
    return this.fieldRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });
  }

  /**
   * 获取模型的所有字段
   */
  async findByModelId(modelId: string): Promise<FieldDefinitionEntity[]> {
    const tenantCode = this.getTenantCode();

    const result = await this.fieldRepository.findManyBase({
      tableName: 'field',
      conditionLambda: 'field.modelId = :modelId AND field.tenant = :tenant AND field.isRemoved = :isRemoved',
      conditionValue: { modelId, tenant: tenantCode, isRemoved: false },
      orderBy: { 'field.sortOrder': 'ASC' },
    });

    return (Array.isArray(result) ? result : result.result) as FieldDefinitionEntity[];
  }

  /**
   * 删除字段（软删除）
   */
  async delete(id: string): Promise<void> {
    const tenantCode = this.getTenantCode();

    const result = await this.fieldRepository.softDeletion({
      id,
      tenant: tenantCode,
    });

    if (result.affected === 0) {
      throw new NotFoundException(`字段 ${id} 不存在`);
    }
  }

  /**
   * 删除模型的所有字段
   */
  async deleteByModelId(modelId: string): Promise<void> {
    const tenantCode = this.getTenantCode();
    await this.fieldRepository.softDeletion({
      modelId,
      tenant: tenantCode,
    });
  }
}
