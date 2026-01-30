import { Module } from '@nestjs/common';
import { EntityRegistModule } from '@cs/nest-typeorm';
import { TestController } from './test.controller';
import { TestService } from './test.service';
import { TestRepository } from './test.repository';
import { TestRecord } from './test.entity';

// 注册测试实体到默认数据库连接
@Module({
  imports: [
    // 注册测试相关的仓储
    EntityRegistModule.forRepos([
      {
        entity: TestRecord,
        repository: TestRepository,
        connectionName: 'default', // 使用默认连接
      },
    ]),
  ],
  controllers: [TestController],
  providers: [TestService, TestRepository],
  exports: [
    // 导出服务和仓储，供其他模块使用
    TestService,
    TestRepository,
  ],
})
export class TestModule {}
