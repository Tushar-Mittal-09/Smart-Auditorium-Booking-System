import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST'),
        port: configService.get<number>('POSTGRES_PORT'),
        username: configService.get<string>('POSTGRES_USER'),
        password: configService.get<string>('POSTGRES_PASSWORD'),
        database: configService.get<string>('POSTGRES_DB'),
        synchronize: configService.get<string>('NODE_ENV') === 'development',
        ssl: configService.get<string>('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
        logging: configService.get<string>('NODE_ENV') === 'development',
        autoLoadEntities: true,
        retryAttempts: 5,
        retryDelay: 3000,
        extra: {
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          max: 20,
          keepAlive: true,
          keepAliveInitialDelayMillis: 10000,
        },
      }),
    }),
  ],
})
export class PostgresModule {}
