declare const redisChannelBrand: unique symbol;

export type RedisChannel<TPayload = unknown> = string & {
    readonly [redisChannelBrand]: true;
    readonly __payload?: TPayload;
};

type ChannelFactoryEntry<TPayload, TArgs extends unknown[]> = (...args: TArgs) => RedisChannel<TPayload>;

export const channel =
    <TPayload>() =>
    <TArgs extends unknown[]>(template: (...args: TArgs) => string): ChannelFactoryEntry<TPayload, TArgs> =>
    (...args: TArgs) =>
        template(...args) as RedisChannel<TPayload>;
