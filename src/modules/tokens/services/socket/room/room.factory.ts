// room.factory.ts
import { ROOM_RULES, RoomDomain, RoomInterval } from './room.constants';
import { TokenSubscribeDto } from '../token.dtos';

export class RoomFactory {
  static create(params: TokenSubscribeDto): string {
    const { domain, resource, interval } = params;

    if (!resource || resource.includes(':')) {
      throw new Error('Invalid resource');
    }

    if (!this.isValid(domain, interval)) {
      throw new Error(`Invalid interval for ${domain}`);
    }

    return `${domain}:${resource}:${interval}`;
  }

  static parse(room: string) {
    const [domain, resource, interval] = room.split(':');
    return { domain, resource, interval };
  }

  static isValid(domain: string, interval: string): interval is RoomInterval {
    if (!(domain in ROOM_RULES)) {
      return false;
    }

    const rules = ROOM_RULES[domain as RoomDomain] as readonly string[];
    return rules.includes(interval);
  }
}
