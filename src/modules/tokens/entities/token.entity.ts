import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from "typeorm";
import { Category } from "./category.entity";

@Entity("tokens")
@Index(["address", "network"], { unique: true })
export class Token {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true })
    address: string;

    @Column()
    symbol: string;

    @Column()
    name: string;

    @Column({ nullable: true })
    logoUri?: string;

    @Column({ nullable: true })
    coingeckoId?: string;

    @Column({ default: "mainnet" })
    network: string;

    @Column({ type: "text", nullable: true })
    description?: string;

    @Column({ nullable: true })
    website?: string;

    @Column({ type: "jsonb", nullable: true })
    socialLinks?: {
        twitter?: string;
        telegram?: string;
        discord?: string;
    };

    @Column({ type: "int", default: 9 })
    decimals: number;

    // Supply Info
    @Column({ type: "decimal", precision: 30, scale: 0, nullable: true })
    totalSupply?: number;

    @Column({ type: "decimal", precision: 30, scale: 0, nullable: true })
    circulatingSupply?: number;

    @Column({ type: "decimal", precision: 30, scale: 0, nullable: true })
    maxSupply?: number;

    // Price & Market
    @Column({ type: "decimal", precision: 30, scale: 9, default: 0 })
    price: number;

    @Column({ type: "decimal", precision: 20, scale: 2, default: 0 })
    priceChange1h: number;

    @Column({ type: "decimal", precision: 20, scale: 2, default: 0 })
    priceChange24h: number;

    @Column({ type: "decimal", precision: 20, scale: 2, default: 0 })
    priceChange7d: number;

    @Column({ type: "decimal", precision: 30, scale: 2, default: 0 })
    marketCap: number;

    @Column({ type: "decimal", precision: 30, scale: 2, default: 0 })
    marketCapChange24h: number;

    @Column({ type: "decimal", precision: 30, scale: 2, default: 0 })
    fdv: number;

    @Column({ type: "decimal", precision: 30, scale: 2, default: 0 })
    liquidity: number;

    @Column({ type: "decimal", precision: 30, scale: 2, default: 0 })
    liquidityChange24h: number;

    @Column({ type: "decimal", precision: 30, scale: 2, default: 0 })
    volume24h: number;

    @Column({ type: "decimal", precision: 30, scale: 2, default: 0 })
    volumeChange24h: number;

    // Trading Activity
    @Column({ type: "int", default: 0 })
    txns24hTotal: number;

    @Column({ type: "int", default: 0 })
    txns24hBuys: number;

    @Column({ type: "int", default: 0 })
    txns24hSells: number;

    @Column({ type: "decimal", precision: 20, scale: 2, default: 0 })
    txns24hChange: number;

    // Holder Metrics
    @Column({ type: "int", default: 0 })
    holdersCount: number;

    @Column({ type: "decimal", precision: 20, scale: 2, default: 0 })
    holdersChange24h: number;

    @Column({ type: "int", default: 0 })
    uniqueWallets24h: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
    top10Percent: number;

    @Column({ type: "decimal", precision: 5, scale: 2, default: 0 })
    insiderPercent: number;

    // Security Audit
    @Column({ default: false })
    mintAuthorityDisabled: boolean;

    @Column({ default: false })
    freezeAuthorityDisabled: boolean;

    @Column({ default: false })
    lpBurnt: boolean;

    @Column({ default: false })
    hasSocialLinks: boolean;

    @Column({ type: "int", default: 50 })
    riskScore: number;

    @Column({ type: "simple-array", nullable: true })
    riskFactors?: string[];

    // Category
    @ManyToOne(() => Category, (category) => category.tokens, { nullable: true })
    @JoinColumn({ name: "categoryId" })
    category?: Category;

    @Column({ nullable: true })
    categoryId?: string;

    // Age
    @Column({ type: "int", default: 0 })
    ageSeconds: number;

    // Sparkline data (last 24h prices)
    @Column({ type: "simple-array", nullable: true })
    priceSparkline?: number[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
