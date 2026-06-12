import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ClusterProvider } from "./cluster.provider";
import { ClusterInterceptor } from "./cluster.interceptor";

@Global()
@Module({
    imports: [ConfigModule],
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
