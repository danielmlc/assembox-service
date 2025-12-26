import { Injectable } from '@nestjs/common';
import { RpcClient } from '@cs/nest-cloud';
import { BasePlugin } from './base.plugin';
import { HookStage, HookContext, HookResult } from '../interfaces';

/**
 * ID 生成插件
 * 在创建记录前自动生成分布式 ID
 */
@Injectable()
export class IdGeneratorPlugin extends BasePlugin {
  code = 'id-generator';
  name = 'ID 生成器';
  description = '在创建记录前自动生成分布式 ID';
  version = '1.0.0';
  priority = 1; // 最高优先级，确保 ID 先生成

  constructor(private readonly rpcClient: RpcClient) {
    super();
    this.registerHooks();
  }

  private registerHooks(): void {
    // 创建前生成 ID
    this.registerHook(HookStage.BEFORE_CREATE, async (context: HookContext): Promise<HookResult> => {
      const data = context.data || {};

      // 如果已经有 ID，跳过
      if (data.id) {
        return {};
      }

      try {
        // 调用 RPC 服务获取分布式 ID
        const newId = await this.rpcClient.getNewId();

        return {
          data: {
            ...data,
            id: newId,
          },
          metadata: {
            generatedId: newId,
          },
        };
      } catch (error) {
        // ID 生成失败，中止操作
        return {
          abort: true,
          abortReason: `ID 生成失败: ${error instanceof Error ? error.message : error}`,
        };
      }
    });
  }
}
