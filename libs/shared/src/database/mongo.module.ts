import { Module, Logger } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const user = configService.get<string>('MONGO_USER');
        const pass = configService.get<string>('MONGO_PASSWORD');
        const host = configService.get<string>('MONGO_HOST');
        const port = configService.get<number>('MONGO_PORT');
        const db = configService.get<string>('MONGO_DB');
        const uri = `mongodb://${user}:${pass}@${host}:${port}/${db}?authSource=admin`;

        return {
          uri,
          retryAttempts: 5,
          retryDelay: 3000,
          connectionFactory: (connection) => {
            const logger = new Logger('MongooseModule');
            connection.on('connected', () => {
              logger.log('Successfully connected to MongoDB');
            });
            connection.on('error', (err: any) => {
              logger.error('MongoDB connection error', err);
            });
            return connection;
          },
        };
      },
    }),
  ],
})
export class MongoModule {}
