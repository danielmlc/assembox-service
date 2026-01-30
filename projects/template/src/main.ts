import { bootstrap } from '@cs/nest-cloud';
import { AppModule } from './app.module';

bootstrap(AppModule, async (app, config) => {
  // 服务启动后回调
});