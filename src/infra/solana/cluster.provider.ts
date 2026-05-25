import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";

@Injectable({ scope: Scope.REQUEST })
export class ClusterProvider {
    constructor(@Inject(REQUEST) private readonly request: Request) {}

    get cluster(): "mainnet" | "devnet" {
        return (this.request as any).cluster ?? "mainnet";
    }

    resolveTableName(baseName: string): string {
        const cluster = this.cluster;
        return `${baseName}_${cluster}`;
    }
}
