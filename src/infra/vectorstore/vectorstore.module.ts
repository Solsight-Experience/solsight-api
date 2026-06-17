import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { VectorStoreService } from "./vectorstore.service";
import { RagDocument } from "../../modules/chat/entities/rag-document.entity";

@Module({
    imports: [ConfigModule, TypeOrmModule.forFeature([RagDocument])],
    providers: [VectorStoreService],
    exports: [VectorStoreService]
})
export class VectorStoreModule {}
