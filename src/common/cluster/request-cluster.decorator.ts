import { BadRequestException, createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { CLUSTERS, Cluster, isValidCluster } from "./cluster.types";

export const RequestCluster = createParamDecorator((_data: unknown, context: ExecutionContext): Cluster => {
    const request = context.switchToHttp().getRequest<Request>();
    const cluster = request.query.cluster;

    if (!isValidCluster(cluster)) {
        throw new BadRequestException(`cluster is required and must be one of: ${CLUSTERS.join(", ")}`);
    }

    return cluster;
});
