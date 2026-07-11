import { INestApplicationContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { ServerOptions } from "socket.io";

@Injectable()
export class SocketIoAdapter extends IoAdapter {
    constructor(
        app: INestApplicationContext,
        private readonly configService: ConfigService
    ) {
        super(app);
    }

    createIOServer(port: number, options?: ServerOptions) {
        return super.createIOServer(port, {
            ...options,
            cors: {
                origin: this.configService.get<string[]>("cors.origin"),
                credentials: this.configService.get<boolean>("cors.credentials")
            }
        });
    }
}
