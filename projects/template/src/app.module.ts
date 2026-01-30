import { Module } from '@nestjs/common';

import { ShareModule } from './share.module';

/**
 * 应用根模块
 * 导入所有业务模块和公共模块
 */
@Module({
  imports: [
    ShareModule,    // 基础设施模块（数据库）
  ],
})
export class AppModule { }
