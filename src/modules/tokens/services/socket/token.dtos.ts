import type { Cluster } from "../../../../common/cluster/cluster.types";

export interface TokenSubscribeDto {
    cluster: Cluster;
    domain: string;
    resource: string;
    interval: string;
}

export interface TokenUnsubscribeDto {
    cluster: Cluster;
    domain: string;
    resource: string;
    interval: string;
}
