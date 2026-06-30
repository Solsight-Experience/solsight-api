export type RedisTtlValue = number | ((...args: string[]) => number);

export const redisTtls = <T extends Record<string, RedisTtlValue>>(ttls: T): T => ttls;
