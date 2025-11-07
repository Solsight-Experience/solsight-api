import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'tokens' })
export class Token {
  @PrimaryColumn()
  address: string;

  @Column()
  symbol: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  logo_uri: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  website: string;

  @Column({ nullable: true })
  twitter: string;

  @Column({ nullable: true })
  telegram: string;

  @Column({ nullable: true })
  discord: string;

  @Column()
  decimals: number;

  @Column('simple-array', { nullable: true })
  tags: string[];

  @Column({ nullable: true })
  coingeckoId: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
