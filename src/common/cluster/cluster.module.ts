import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ClusterProvider } from "./cluster.provider";
import { ClusterInterceptor } from "./cluster.interceptor";
import { ClusterEchoController } from "./cluster-echo.controller";

@Global()
@Module({
    imports: [ConfigModule],
    controllers: [ClusterEchoController],
    providers: [
        ClusterProvider,
        {
            provide: APP_INTERCEPTOR,
            useClass: ClusterInterceptor
        }
    ],
    exports: [ClusterProvider]
})
export class ClusterModule {}
