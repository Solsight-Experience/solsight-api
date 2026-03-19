import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('ohlc_candles')
@Index(['tokenMint', 'interval', 'timestamp'], { unique: true })
export class OhlcCandle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tokenMint: string;

  @Column()
  interval: string;

  @Column({ type: 'bigint' })
  timestamp: number;

  @Column({ type: 'decimal', precision: 30, scale: 10 })
  open: number;

  @Column({ type: 'decimal', precision: 30, scale: 10 })
  high: number;

  @Column({ type: 'decimal', precision: 30, scale: 10 })
  low: number;

  @Column({ type: 'decimal', precision: 30, scale: 10 })
  close: number;

  @Column({ type: 'decimal', precision: 30, scale: 10, default: 0 })
  volume: number;

  @CreateDateColumn()
  createdAt: Date;
}
