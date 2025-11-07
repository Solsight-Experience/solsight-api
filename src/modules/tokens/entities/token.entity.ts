import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'tokens' })
export class Token {
  @PrimaryColumn()
  mintAddress: string;

  @Column()
  symbol: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  logoUrl: string;

  @Column()
  decimals: number;

  @Column('simple-array', { nullable: true })
  tags: string[];

  @Column({ nullable: true })
  coingeckoId: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
