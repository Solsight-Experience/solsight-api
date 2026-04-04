import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Token } from "./token.entity";

@Entity("categories")
export class Category {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true })
    slug: string;

    @Column()
    name: string;

    @Column({ type: "text", nullable: true })
    description?: string;

    @Column({ type: "float", default: 0 })
    marketCap: number;

    @Column({ type: "float", default: 0 })
    marketCapChange24h: number;

    @Column({ type: "float", default: 0 })
    volume24h: number;

    @Column("simple-array", { nullable: true })
    top3Coins: string[];

    @Column("simple-array", { nullable: true })
    top3CoinsId: string[];

    @OneToMany(() => Token, (token) => token.category)
    tokens: Token[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
