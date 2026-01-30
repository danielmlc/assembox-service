import { Global } from '@nestjs/common';
import { CSModule } from '@cs/nest-cloud';
import { DatabaseModule } from '@cs/nest-typeorm';
import { ConfigService } from '@cs/nest-config';

@Global()
@CSModule({
  imports: [
    DatabaseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return {
          ...config.get('mysql'),
        };
      },
    }),
  ],
  exports: [DatabaseModule],
})
export class ShareModule {}
