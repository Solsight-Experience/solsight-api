import { DataSource } from "typeorm";
import { Token } from "../../modules/tokens/entities/token.entity";
import { Category } from "../../modules/tokens/entities/category.entity";

async function seedDevnetTokens(): Promise<void> {
    const devnetConfig = {
        type: "postgres" as const,
        host: process.env.DATABASE_HOST || "localhost",
        port: parseInt(process.env.DATABASE_PORT || "5432", 10),
        username: process.env.DATABASE_USERNAME || "postgres",
        password: process.env.DATABASE_PASSWORD || "password",
        database: process.env.DATABASE_NAME || "flaxh_trade",
        schema: "devnet",
        entities: [Token, Category],
        synchronize: false,
        logging: false
    };

    const dataSource = new DataSource(devnetConfig);

    await dataSource.initialize();

    const tokenRepo = dataSource.getRepository(Token);
    const categoryRepo = dataSource.getRepository(Category);

    const existingTokens = await tokenRepo.count();
    if (existingTokens > 0) {
        console.log(`Devnet already seeded with ${existingTokens} tokens. Skipping.`);
        await dataSource.destroy();
        return;
    }

    const devnetTokens = [
        {
            mint: "EPjFWaJQbLj5ci6nWtP4G6VrFWGltShycf7guzsvd8qj",
            name: "USDC (devnet)",
            symbol: "USDC",
            decimals: 6,
            logo: "https://raw.githubusercontent.com/solflare-wallet/token-list/main/solana-tokenlist.json"
        },
        {
            mint: "4zMMUHvgFws7Bp9sU8AB8initVqKjCap7EaCsJUNdFt",
            name: "SOL (devnet)",
            symbol: "SOL",
            decimals: 9,
            logo: "https://raw.githubusercontent.com/solflare-wallet/token-list/main/solana-tokenlist.json"
        }
    ];

    const categoryName = "Devnet Tokens";
    let category = await categoryRepo.findOne({ where: { name: categoryName } });
    if (!category) {
        category = categoryRepo.create({ name: categoryName, description: "Seeded devnet tokens" });
        await categoryRepo.save(category);
    }

    for (const tokenData of devnetTokens) {
        const token = tokenRepo.create({
            ...tokenData,
            category: category
        });
        await tokenRepo.save(token);
    }

    console.log(`Seeded ${devnetTokens.length} tokens to devnet schema`);
    await dataSource.destroy();
}

seedDevnetTokens().catch((err) => {
    console.error("Devnet seeding failed:", err);
    process.exit(1);
});
