import { Injectable, NestInterceptor, ExecutionContext, CallHandler, BadRequestException } from "@nestjs/common";
import { Observable } from "rxjs";
import { Request } from "express";
import { CLUSTERS, Cluster, DEFAULT_CLUSTER } from "./cluster.types";

@Injectable()
export class ClusterInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest<Request>();

        const clusterParam = request.query.cluster as string | undefined;

        if (clusterParam && !CLUSTERS.includes(clusterParam as Cluster)) {
            throw new BadRequestException(`Invalid cluster. Must be one of: ${CLUSTERS.join(", ")}`);
        }

        const cluster: Cluster = (clusterParam as Cluster) || DEFAULT_CLUSTER;
        request.cluster = cluster;

        return next.handle();
    }
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            cluster: Cluster;
        }
    }
}
