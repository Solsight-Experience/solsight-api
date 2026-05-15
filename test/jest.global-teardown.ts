const containerKeys = ["__POSTGRES_CONTAINER__", "__REDIS_CONTAINER__", "__MONGO_CONTAINER__"] as const;

export default async () => {
    await Promise.allSettled(
        containerKeys.map(async (key) => {
            const container = (global as any)[key];

            if (!container) return;
            try {
                await container.stop();
                (global as any)[key] = null;
                delete (global as any)[key];
            } catch (error) {}
        })
    );
};
