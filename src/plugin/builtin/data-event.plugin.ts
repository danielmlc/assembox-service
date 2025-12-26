import { Injectable, Logger } from '@nestjs/common';
import { BasePlugin } from './base.plugin';
import { HookStage, HookContext, HookResult } from '../interfaces';

/**
 * 数据事件类型
 */
export enum DataEventType {
  CREATED = 'data.created',
  UPDATED = 'data.updated',
  DELETED = 'data.deleted',
}

/**
 * 数据事件
 */
export interface DataEvent {
  type: DataEventType;
  modelCode: string;
  modelId: string;
  recordId?: string;
  data?: Record<string, any>;
  tenantCode: string;
  userId?: string;
  timestamp: Date;
}

/**
 * 数据事件插件
 * 在数据变更后发布事件到消息队列
 *
 * 注意：此插件为示例实现，实际使用时需要注入 MqService
 */
@Injectable()
export class DataEventPlugin extends BasePlugin {
  code = 'data-event';
  name = '数据事件';
  description = '在数据变更后发布事件到消息队列';
  version = '1.0.0';
  priority = 1000; // 最低优先级，确保在其他操作完成后执行

  private readonly logger = new Logger(DataEventPlugin.name);

  // TODO: 注入 MqService
  // constructor(private readonly mqService: MqService) {
  //   super();
  //   this.registerHooks();
  // }

  constructor() {
    super();
    this.registerHooks();
  }

  private registerHooks(): void {
    // 创建后发布事件
    this.registerHook(HookStage.AFTER_CREATE, async (context: HookContext): Promise<HookResult> => {
      await this.publishEvent({
        type: DataEventType.CREATED,
        modelCode: context.modelCode,
        modelId: context.modelId,
        recordId: context.result?.id,
        data: context.result,
        tenantCode: context.tenantCode,
        userId: context.userId,
        timestamp: new Date(),
      });

      return {};
    });

    // 更新后发布事件
    this.registerHook(HookStage.AFTER_UPDATE, async (context: HookContext): Promise<HookResult> => {
      await this.publishEvent({
        type: DataEventType.UPDATED,
        modelCode: context.modelCode,
        modelId: context.modelId,
        recordId: context.result?.id,
        data: context.result,
        tenantCode: context.tenantCode,
        userId: context.userId,
        timestamp: new Date(),
      });

      return {};
    });

    // 删除后发布事件
    this.registerHook(HookStage.AFTER_DELETE, async (context: HookContext): Promise<HookResult> => {
      await this.publishEvent({
        type: DataEventType.DELETED,
        modelCode: context.modelCode,
        modelId: context.modelId,
        recordId: context.data?.id,
        data: context.data,
        tenantCode: context.tenantCode,
        userId: context.userId,
        timestamp: new Date(),
      });

      return {};
    });

    // 错误时记录日志
    this.registerHook(HookStage.ON_ERROR, async (context: HookContext): Promise<HookResult> => {
      this.logger.error(
        `Data operation error: ${context.error?.message}`,
        {
          modelCode: context.modelCode,
          actionCode: context.actionCode,
          tenantCode: context.tenantCode,
          userId: context.userId,
        },
      );

      return {};
    });
  }

  /**
   * 发布数据事件
   */
  private async publishEvent(event: DataEvent): Promise<void> {
    try {
      // TODO: 使用 MqService 发布消息
      // await this.mqService.publish('aseembox.data.events', event);

      this.logger.debug(`Data event published: ${event.type} - ${event.modelCode}/${event.recordId}`);

      // 临时实现：只记录日志
      this.logger.log(`[DataEvent] ${event.type}: ${event.modelCode}/${event.recordId}`);
    } catch (error) {
      // 事件发布失败不应该影响主流程
      this.logger.error(`Failed to publish data event: ${error instanceof Error ? error.message : error}`);
    }
  }
}
