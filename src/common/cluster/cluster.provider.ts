import { Injectable, Scope, Inject } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { Request } from "express";
import { Cluster } from "./cluster.types";

@Injectable({ scope: Scope.REQUEST })
export class ClusterProvider {
    constructor(@Inject(REQUEST) private request: Request) {}

    get cluster(): Cluster {
        return this.request.cluster;
    }
}
