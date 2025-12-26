import { Global } from '@nestjs/common';
import { CSModule } from '@cs/nest-cloud';
import { DatabaseModule } from '@cs/nest-typeorm';
import { RedisModule } from '@cs/nest-redis';
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
    RedisModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        return {
          ...config.get('redis'),
        };
      },
    }),
  ],
  exports: [DatabaseModule, RedisModule],
})
export class SharedModule {}
