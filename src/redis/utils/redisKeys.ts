declare const redisKeyBrand: unique symbol;

export type RedisKey = string & { readonly [redisKeyBrand]: true };

type RedisKeyBuilder = (...args: any[]) => string;

export const redisKeys = <T extends Record<string, RedisKeyBuilder>>(keys: T): { [K in keyof T]: (...args: Parameters<T[K]>) => RedisKey } => {
    const result = {} as { [K in keyof T]: (...args: Parameters<T[K]>) => RedisKey };

    for (const [name, builder] of Object.entries(keys)) {
        result[name as keyof T] = ((...args: Array<string | number>) => builder(...args) as RedisKey) as (typeof result)[keyof T];
    }

    return result;
};
