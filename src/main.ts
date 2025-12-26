import { bootstrap } from '@cs/nest-cloud';
import { AseemboxModule } from './aseembox.module';

bootstrap(AseemboxModule, async (app, config) => {
  const serviceName = config.get('name');
  console.log(`AseemBox Service started: ${serviceName}`);
});
