import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";
import { setupApp } from "./config/setup-app";

async function bootstrap() {
    const app = await NestFactory.create(AppModule, {
        bufferLogs: true
    });
    setupApp(app);

    const configService = app.get(ConfigService);
    const port = configService.getOrThrow<number>("port"); // backend port
    await app.listen(port);
}
void bootstrap();
