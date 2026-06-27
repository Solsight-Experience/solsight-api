import { IsIn } from "class-validator";
import { CLUSTERS, type Cluster } from "./cluster.types";

export class ClusterQueryDto {
    @IsIn(CLUSTERS)
    cluster!: Cluster;
}
