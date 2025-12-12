import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import * as cookieParser from 'cookie-parser';
import { setupApp } from './config/setup-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  setupApp(app);
  app.useWebSocketAdapter(new IoAdapter(app));

  app.use(cookieParser());

  app.enableCors({
    origin: 'http://localhost:3000',   // FE URL
    credentials: true,                 // Cho phép gửi cookie
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3001); // backend port
  app.setGlobalPrefix('api');
  await app.listen(port);
}
bootstrap();
