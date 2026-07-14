import { INestApplication, ValidationPipe } from "@nestjs/common";
import { AppLoggerService } from "src/common/logger/logger.service";
import { ConfigService } from "@nestjs/config";
import * as cookieParser from "cookie-parser";
import { SocketIoAdapter } from "src/websocket/socket-io.adapter";

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
            forbidNonWhitelisted: false,
            transform: true
        })
    );

    const configService = app.get(ConfigService);
    app.useWebSocketAdapter(new SocketIoAdapter(app, configService));

    app.use(cookieParser());

    app.enableCors({
        origin: configService.get<string[]>("cors.origin"),
        credentials: configService.get<boolean>("cors.credentials"),
        allowedHeaders: ["Content-Type", "Authorization"],
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    });

    console.log("CORS configuration:", {
        origin: configService.get<string[]>("cors.origin"),
        credentials: configService.get<boolean>("cors.credentials")
    });

    app.setGlobalPrefix("api");

    logger.log("Application setup completed.");
    return app;
}
