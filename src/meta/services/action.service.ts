import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository, BaseRepository } from '@cs/nest-typeorm';
import { ContextService } from '@cs/nest-common';
import { ActionDefinitionEntity } from '../entities';
import { CreateActionDto, UpdateActionDto, IActionDefinition } from '../../shared/interfaces';
import { ActionType, DEFAULT_PAGE_CONFIG } from '../../shared/constants/aseembox.constants';

/**
 * 操作仓储
 */
@Injectable()
export class ActionRepository extends BaseRepository<ActionDefinitionEntity> {}

/**
 * 操作定义服务
 */
@Injectable()
export class ActionService {
  constructor(
    @InjectRepository({
      entity: ActionDefinitionEntity,
      repository: ActionRepository,
    })
    private readonly actionRepository: ActionRepository,
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
   * 创建操作
   */
  async create(modelId: string, dto: CreateActionDto): Promise<ActionDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    // 检查操作代码是否已存在
    const existing = await this.actionRepository.findOne({
      modelId,
      code: dto.code,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (existing) {
      throw new ConflictException(`操作代码 ${dto.code} 在该模型中已存在`);
    }

    const action = new ActionDefinitionEntity();
    action.modelId = modelId;
    action.code = dto.code;
    action.name = dto.name;
    action.description = dto.description;
    action.type = dto.type;
    action.permissions = dto.permissions;
    action.hooks = dto.hooks;
    action.queryConfig = dto.queryConfig;
    action.mutationConfig = dto.mutationConfig;
    action.customConfig = dto.customConfig;
    action.enabled = dto.enabled ?? true;
    action.tenant = tenantCode;

    return this.actionRepository.saveOne(action);
  }

  /**
   * 为模型创建默认操作
   */
  async createDefaultActions(modelId: string): Promise<ActionDefinitionEntity[]> {
    const tenantCode = this.getTenantCode();

    const defaultActions: CreateActionDto[] = [
      {
        code: 'create',
        name: '创建',
        type: ActionType.CREATE,
        enabled: true,
      },
      {
        code: 'update',
        name: '更新',
        type: ActionType.UPDATE,
        enabled: true,
      },
      {
        code: 'delete',
        name: '删除',
        type: ActionType.SOFT_DELETE,
        enabled: true,
      },
      {
        code: 'query',
        name: '查询',
        type: ActionType.QUERY,
        queryConfig: {
          defaultPageSize: DEFAULT_PAGE_CONFIG.DEFAULT_PAGE_SIZE,
          maxPageSize: DEFAULT_PAGE_CONFIG.MAX_PAGE_SIZE,
        },
        enabled: true,
      },
    ];

    const actions = defaultActions.map(dto => {
      const action = new ActionDefinitionEntity();
      action.modelId = modelId;
      action.code = dto.code;
      action.name = dto.name;
      action.type = dto.type;
      action.queryConfig = dto.queryConfig;
      action.enabled = dto.enabled ?? true;
      action.tenant = tenantCode;
      return action;
    });

    return this.actionRepository.saveMany(actions);
  }

  /**
   * 更新操作
   */
  async update(id: string, dto: UpdateActionDto): Promise<ActionDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    const action = await this.actionRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (!action) {
      throw new NotFoundException(`操作 ${id} 不存在`);
    }

    if (dto.code !== undefined) action.code = dto.code;
    if (dto.name !== undefined) action.name = dto.name;
    if (dto.description !== undefined) action.description = dto.description;
    if (dto.type !== undefined) action.type = dto.type;
    if (dto.permissions !== undefined) action.permissions = dto.permissions;
    if (dto.hooks !== undefined) action.hooks = dto.hooks;
    if (dto.queryConfig !== undefined) action.queryConfig = dto.queryConfig;
    if (dto.mutationConfig !== undefined) action.mutationConfig = dto.mutationConfig;
    if (dto.customConfig !== undefined) action.customConfig = dto.customConfig;
    if (dto.enabled !== undefined) action.enabled = dto.enabled;

    return this.actionRepository.saveOne(action);
  }

  /**
   * 根据 ID 获取操作
   */
  async findById(id: string): Promise<ActionDefinitionEntity | null> {
    const tenantCode = this.getTenantCode();
    return this.actionRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });
  }

  /**
   * 获取模型的所有操作
   */
  async findByModelId(modelId: string): Promise<ActionDefinitionEntity[]> {
    const tenantCode = this.getTenantCode();
    return this.actionRepository.findMany({
      modelId,
      tenant: tenantCode,
      isRemoved: false,
    });
  }

  /**
   * 根据模型 ID 和操作代码获取操作
   */
  async findByModelIdAndCode(modelId: string, code: string): Promise<ActionDefinitionEntity | null> {
    const tenantCode = this.getTenantCode();
    return this.actionRepository.findOne({
      modelId,
      code,
      tenant: tenantCode,
      isRemoved: false,
    });
  }

  /**
   * 启用/禁用操作
   */
  async setEnabled(id: string, enabled: boolean): Promise<ActionDefinitionEntity> {
    const tenantCode = this.getTenantCode();

    const action = await this.actionRepository.findOne({
      id,
      tenant: tenantCode,
      isRemoved: false,
    });

    if (!action) {
      throw new NotFoundException(`操作 ${id} 不存在`);
    }

    action.enabled = enabled;
    return this.actionRepository.saveOne(action);
  }

  /**
   * 删除操作（软删除）
   */
  async delete(id: string): Promise<void> {
    const tenantCode = this.getTenantCode();

    const result = await this.actionRepository.softDeletion({
      id,
      tenant: tenantCode,
    });

    if (result.affected === 0) {
      throw new NotFoundException(`操作 ${id} 不存在`);
    }
  }

  /**
   * 删除模型的所有操作
   */
  async deleteByModelId(modelId: string): Promise<void> {
    const tenantCode = this.getTenantCode();
    await this.actionRepository.softDeletion({
      modelId,
      tenant: tenantCode,
    });
  }
}
