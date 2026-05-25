import { BadRequestException, CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";

export class ClusterInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler) {
        const request = context.switchToHttp().getRequest();
        const cluster = request.query.cluster ?? "mainnet";

        if (!["mainnet", "devnet"].includes(cluster)) {
            throw new BadRequestException("Invalid cluster. Allowed values are 'mainnet' and 'devnet'.");
        }

        request.cluster = cluster;
        return next.handle();
    }
}
