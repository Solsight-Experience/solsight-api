import { Module } from "@nestjs/common";
import { KoraService } from "./kora.service";

@Module({
    providers: [KoraService],
    exports: [KoraService]
})
export class KoraModule {}
