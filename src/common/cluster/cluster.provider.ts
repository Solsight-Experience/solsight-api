import { Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { Cluster, DEFAULT_CLUSTER } from "./cluster.types";

export const CLUSTER_CLS_KEY = "cluster";

@Injectable()
export class ClusterProvider {
    constructor(private readonly cls: ClsService) {}

    get cluster(): Cluster {
        return this.cls.get<Cluster>(CLUSTER_CLS_KEY) ?? DEFAULT_CLUSTER;
    }
}
