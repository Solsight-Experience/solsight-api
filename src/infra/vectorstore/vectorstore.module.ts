import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { VectorStoreService } from "./vectorstore.service";

@Module({
    imports: [ConfigModule],
    providers: [VectorStoreService],
    exports: [VectorStoreService]
})
export class VectorStoreModule {}
