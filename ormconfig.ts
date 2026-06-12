import { TypeOrmModuleOptions } from "@nestjs/typeorm";

export default {
    ...({
        type: "postgres",
        host: process.env.DB_HOST || "localhost",
        port: process.env.DB_PORT || 5432,
        username: process.env.DB_USERNAME || "postgres",
        password: process.env.DB_PASSWORD || "password",
        database: process.env.DB_DATABASE || "solsight",
        entities: [__dirname + "/../**/*.entity{.ts,.js}"],
        seeds: [__dirname + "/seeds/**/*{.ts,.js}"],
        factories: [__dirname + "/factories/**/*{.ts,.js}"]
    } as TypeOrmModuleOptions)
};
