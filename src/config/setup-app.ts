import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { AppLoggerService } from 'src/common/logger/logger.service';

export function setupApp(app: INestApplication) {
  // Use custom logger
  const logger = app.get(AppLoggerService);
  app.useLogger(logger);

  // Set global prefix for all routes
  app.setGlobalPrefix('api');

  // Enable URI versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: '*',
    credentials: true,
  });

  console.log('Application setup completed.');
  return app;
}
