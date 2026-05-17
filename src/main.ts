import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import * as cookieParser from "cookie-parser";
import { setupApp } from "./config/setup-app";

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bufferLogs: true
    });
    setupApp(app);
    app.useWebSocketAdapter(new IoAdapter(app));

    app.use(cookieParser());

    app.enableCors({
        origin: ["http://localhost:3001", "http://localhost:3002"],
        credentials: true,
        allowedHeaders: ["Content-Type", "Authorization"],
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    });

    const configService = app.get(ConfigService);
    const port = configService.get<number>("PORT", 3000); // backend port
    app.setGlobalPrefix("api");
    await app.listen(port);
}
bootstrap();
