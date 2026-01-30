import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ShareModule } from './share.moudle';
import { TestModule } from './modules/test/test.module';
import { CommonFieldsModule } from './modules/common-fields/common-fields.module';

@Module({
  imports: [ShareModule, TestModule, CommonFieldsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
