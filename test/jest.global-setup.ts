import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer } from "@testcontainers/redis";
import { MongoDBContainer } from "@testcontainers/mongodb";

export default async () => {
    const postgresContainer = await new PostgreSqlContainer("postgres:15-alpine")
        .withDatabase("test_db")
        .withUsername("test_user")
        .withPassword("test_pass")
        .start();

    const redisContainer = await new RedisContainer("redis:7-alpine").start();
    const mongoContainer = await new MongoDBContainer("mongo:6.0").start();

    process.env.DATABASE_HOST = postgresContainer.getHost();
    process.env.DATABASE_PORT = postgresContainer.getMappedPort(5432).toString();
    process.env.REDIS_URL = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
    process.env.MONGODB_URI = mongoContainer.getConnectionString();

    // Store container references to stop them later
    (global as any).__POSTGRES_CONTAINER__ = postgresContainer;
    (global as any).__REDIS_CONTAINER__ = redisContainer;
    (global as any).__MONGO_CONTAINER__ = mongoContainer;
};
