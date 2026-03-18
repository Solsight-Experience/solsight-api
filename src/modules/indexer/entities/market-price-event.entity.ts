import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('market_price_events')
@Index(['tokenMint', 'timestamp'])
export class MarketPriceEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tokenMint: string;

  @Column({ nullable: true })
  poolAddress: string;

  @Column({ type: 'decimal', precision: 30, scale: 9 })
  price: number;

  @Column({ type: 'bigint' })
  slot: string;

  @Column({ type: 'bigint' })
  timestamp: string;

  @Column({ nullable: true })
  txSignature: string;

  @Column({ default: 'UNKNOWN' })
  source: string;

  @Column()
  eventType: string;

  @Column({ type: 'numeric', nullable: true })
  coinReserve: string;

  @Column({ type: 'numeric', nullable: true })
  pcReserve: string;

  @CreateDateColumn()
  createdAt: Date;
}
