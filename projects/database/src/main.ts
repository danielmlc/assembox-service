import { bootstrap } from '@cs/nest-cloud';
import { AppModule } from './app.module';
bootstrap(AppModule, async (app, config) => {
  // 服务启动后可以干点事情
  const conf = config.get('name');
  console.log('我启动了，当前服务是：', conf);
});
