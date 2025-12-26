import { Injectable } from '@nestjs/common';
import { ContextService } from '@cs/nest-common';
import { BasePlugin } from './base.plugin';
import { HookStage, HookContext, HookResult } from '../interfaces';

/**
 * 审计字段插件
 * 自动填充创建人、修改人等审计字段
 */
@Injectable()
export class AuditFieldsPlugin extends BasePlugin {
  code = 'audit-fields';
  name = '审计字段';
  description = '自动填充创建人、修改人等审计字段';
  version = '1.0.0';
  priority = 2; // 在 ID 生成之后执行

  constructor(private readonly contextService: ContextService) {
    super();
    this.registerHooks();
  }

  private registerHooks(): void {
    // 创建前填充审计字段
    this.registerHook(HookStage.BEFORE_CREATE, async (context: HookContext): Promise<HookResult> => {
      const data = context.data || {};
      const now = new Date();

      const auditData = {
        tenant: context.tenantCode,
        createdAt: now,
        creatorId: context.userId || null,
        creatorName: context.userName || null,
        modifierAt: now,
        modifierId: context.userId || null,
        modifierName: context.userName || null,
        isRemoved: false,
        version: 1,
      };

      return {
        data: {
          ...data,
          ...auditData,
        },
      };
    });

    // 更新前填充修改人字段
    this.registerHook(HookStage.BEFORE_UPDATE, async (context: HookContext): Promise<HookResult> => {
      const data = context.data || {};
      const now = new Date();

      const updateAuditData = {
        modifierAt: now,
        modifierId: context.userId || null,
        modifierName: context.userName || null,
      };

      return {
        data: {
          ...data,
          ...updateAuditData,
        },
      };
    });

    // 删除前填充修改人字段（软删除时）
    this.registerHook(HookStage.BEFORE_DELETE, async (context: HookContext): Promise<HookResult> => {
      const data = context.data || {};
      const now = new Date();

      return {
        data: {
          ...data,
          modifierAt: now,
          modifierId: context.userId || null,
          modifierName: context.userName || null,
          isRemoved: true,
        },
      };
    });
  }
}
