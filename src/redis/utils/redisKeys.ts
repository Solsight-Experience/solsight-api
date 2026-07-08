declare const redisKeyBrand: unique symbol;

export type RedisKey = string & { readonly [redisKeyBrand]: true };

type RedisKeyBuilder = (...args: never[]) => string;
type RedisKeyMap<T extends Record<string, RedisKeyBuilder>> = { [K in keyof T]: (...args: Parameters<T[K]>) => RedisKey };

export const redisKeys = <T extends Record<string, RedisKeyBuilder>>(keys: T): RedisKeyMap<T> => {
    const result = {} as RedisKeyMap<T>;

    for (const name of Object.keys(keys) as Array<keyof T>) {
        const builder = keys[name] as (...args: Parameters<T[typeof name]>) => string;

        result[name] = ((...args: Parameters<T[typeof name]>) => builder(...args) as RedisKey) as RedisKeyMap<T>[typeof name];
    }

    return result;
};
