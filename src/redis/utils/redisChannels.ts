declare const redisChannelBrand: unique symbol;

export type RedisChannel<TPayload = unknown> = string & {
    readonly [redisChannelBrand]: true;
    readonly __payload?: TPayload;
};

type RedisChannelBuilder = (...args: unknown[]) => string;
type RedisChannelMap<T extends Record<string, RedisChannelBuilder>> = {
    [K in keyof T]: (...args: Parameters<T[K]>) => RedisChannel;
};

export const redisChannels = <T extends Record<string, RedisChannelBuilder>>(channels: T): RedisChannelMap<T> => {
    const result = {} as RedisChannelMap<T>;

    for (const name of Object.keys(channels) as Array<keyof T>) {
        const builder = channels[name] as (...args: Parameters<T[typeof name]>) => string;
        result[name] = ((...args: Parameters<T[typeof name]>) => builder(...args) as RedisChannel) as RedisChannelMap<T>[typeof name];
    }

    return result;
};

type ChannelFactoryEntry<TPayload, TArgs extends unknown[]> = (...args: TArgs) => RedisChannel<TPayload>;

export const channel =
    <TPayload>() =>
    <TArgs extends unknown[]>(template: (...args: TArgs) => string): ChannelFactoryEntry<TPayload, TArgs> =>
    (...args: TArgs) =>
        template(...args) as RedisChannel<TPayload>;
