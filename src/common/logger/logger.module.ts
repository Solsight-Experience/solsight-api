import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppLoggerService } from "./logger.service";

@Module({
    imports: [ConfigModule],
    providers: [AppLoggerService],
    exports: [AppLoggerService]
})
export class LoggerModule {}
