import { INestApplication, ValidationPipe } from "@nestjs/common";
import { AppLoggerService } from "src/common/logger/logger.service";

export function setupApp(app: INestApplication) {
    // Use custom logger
    const logger = app.get(AppLoggerService);
    app.useLogger(logger);

    // Set global prefix for all routes
    app.setGlobalPrefix("api");

    // Validation
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true
        })
    );

    logger.log("Application setup completed.");
    return app;
}
