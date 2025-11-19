import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Token } from './token.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 30, scale: 2, default: 0 })
  marketCap: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  change1h: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  change24h: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  change7d: number;

  @Column({ type: 'decimal', precision: 30, scale: 2, default: 0 })
  volume: number;

  @Column({ type: 'int', default: 0 })
  numTokens: number;

  @OneToMany(() => Token, (token) => token.category)
  tokens: Token[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
