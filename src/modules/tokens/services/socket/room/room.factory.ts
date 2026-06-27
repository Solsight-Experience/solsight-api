// room.factory.ts
import { ROOM_RULES, RoomDomain, RoomInterval } from "./room.constants";
import { TokenSubscribeDto } from "../token.dtos";
import { isValidCluster } from "../../../../../common/cluster/cluster.types";

export class RoomFactory {
    static create(params: TokenSubscribeDto): string {
        const { cluster, domain, resource, interval } = params;

        if (!isValidCluster(cluster)) {
            throw new Error("Invalid cluster");
        }

        if (!resource || resource.includes(":")) {
            throw new Error("Invalid resource");
        }

        if (!this.isValid(domain, interval)) {
            throw new Error(`Invalid interval for ${domain}`);
        }

        return `${domain}:${cluster}:${resource}:${interval}`;
    }

    static parse(room: string) {
        const [domain, cluster, resource, interval] = room.split(":");
        if (!isValidCluster(cluster)) {
            throw new Error("Invalid cluster in room");
        }
        return { domain, cluster, resource, interval };
    }

    static isValid(domain: string, interval: string): interval is RoomInterval {
        if (!(domain in ROOM_RULES)) {
            return false;
        }

        const rules = ROOM_RULES[domain as RoomDomain] as readonly string[];
        return rules.includes(interval);
    }
}
