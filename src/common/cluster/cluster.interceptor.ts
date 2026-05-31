import { Injectable, NestInterceptor, ExecutionContext, CallHandler, BadRequestException } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { Observable } from "rxjs";
import { Request } from "express";
import { CLUSTERS, Cluster, DEFAULT_CLUSTER } from "./cluster.types";
import { CLUSTER_CLS_KEY } from "./cluster.provider";

@Injectable()
export class ClusterInterceptor implements NestInterceptor {
    constructor(private readonly cls: ClsService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest<Request>();

        const clusterParam = request.query.cluster as string | undefined;

        if (clusterParam && !CLUSTERS.includes(clusterParam as Cluster)) {
            throw new BadRequestException(`Invalid cluster. Must be one of: ${CLUSTERS.join(", ")}`);
        }

        const cluster: Cluster = (clusterParam as Cluster) || DEFAULT_CLUSTER;
        this.cls.set(CLUSTER_CLS_KEY, cluster);

        return next.handle();
    }
}
