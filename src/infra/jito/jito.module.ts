import { Module } from "@nestjs/common";
import { JitoService } from "./jito.service";

@Module({
    providers: [JitoService],
    exports: [JitoService]
})
export class JitoModule {}
