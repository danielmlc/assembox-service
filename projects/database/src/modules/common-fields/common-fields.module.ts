import { Module } from '@nestjs/common';
import { EntityRegistModule } from '@cs/nest-typeorm';
import { CommonFieldsController } from './common-fields.controller';
import { CommonFieldsService } from './common-fields.service';
import { CommonFieldsDemo } from './common-fields.entity';

/**
 * 常用字段模块 - 跨库操作示例
 * 该模块连接到 'common' 数据库（test 库）
 */
@Module({
  imports: [
    // 注册 CommonFieldsDemo 实体到 'common' 数据源
    EntityRegistModule.forRepos([
      {
        entity: CommonFieldsDemo,
        connectionName: 'common', // 指定使用 common 数据源
      },
    ]),
  ],
  controllers: [CommonFieldsController],
  providers: [CommonFieldsService],
  exports: [CommonFieldsService],
})
export class CommonFieldsModule {}
