import { DataSource } from "typeorm";
import { Token } from "../../modules/tokens/entities/token.entity";
import { Category } from "../../modules/tokens/entities/category.entity";

const DEVNET_NETWORK = "devnet";

async function seedDevnetTokens(): Promise<void> {
    const dataSource = new DataSource({
        type: "postgres",
        host: process.env.DATABASE_HOST || "localhost",
        port: parseInt(process.env.DATABASE_PORT || "5432", 10),
        username: process.env.DATABASE_USERNAME || "postgres",
        password: process.env.DATABASE_PASSWORD || "password",
        database: process.env.DATABASE_NAME || "flaxh_trade",
        entities: [Token, Category],
        synchronize: false,
        logging: false
    });

    await dataSource.initialize();

    const tokenRepo = dataSource.getRepository(Token);
    const categoryRepo = dataSource.getRepository(Category);

    const existingTokens = await tokenRepo.count({ where: { network: DEVNET_NETWORK } });
    if (existingTokens > 0) {
        console.log(`Devnet already seeded with ${existingTokens} tokens. Skipping.`);
        await dataSource.destroy();
        return;
    }

    const devnetTokens = [
        {
            address: "EPjFWaJQbLj5ci6nWtP4G6VrFWGltShycf7guzsvd8qj",
            name: "USDC (devnet)",
            symbol: "USDC",
            decimals: 6,
            logoUri: "https://raw.githubusercontent.com/solflare-wallet/token-list/main/solana-tokenlist.json"
        },
        {
            address: "4zMMUHvgFws7Bp9sU8AB8initVqKjCap7EaCsJUNdFt",
            name: "SOL (devnet)",
            symbol: "SOL",
            decimals: 9,
            logoUri: "https://raw.githubusercontent.com/solflare-wallet/token-list/main/solana-tokenlist.json"
        }
    ];

    const categorySlug = "devnet-tokens";
    let category = await categoryRepo.findOne({ where: { slug: categorySlug } });
    if (!category) {
        category = categoryRepo.create({ slug: categorySlug, name: "Devnet Tokens", description: "Seeded devnet tokens" });
        await categoryRepo.save(category);
    }

    for (const tokenData of devnetTokens) {
        const token = tokenRepo.create({
            ...tokenData,
            network: DEVNET_NETWORK,
            category
        });
        await tokenRepo.save(token);
    }

    console.log(`Seeded ${devnetTokens.length} tokens for network=${DEVNET_NETWORK}`);
    await dataSource.destroy();
}

seedDevnetTokens().catch((err) => {
    console.error("Devnet seeding failed:", err);
    process.exit(1);
});
