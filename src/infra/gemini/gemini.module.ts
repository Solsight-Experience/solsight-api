import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { OpenAIModule } from "../openai/openai.module";
import { GeminiService } from "./gemini.service";

@Module({
    imports: [ConfigModule, OpenAIModule],
    providers: [GeminiService],
    exports: [GeminiService]
})
export class GeminiModule {}
