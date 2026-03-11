import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum NotificationEventType {
  SWAP_EXECUTED = 'swap_executed',
  SWAP_FAILED = 'swap_failed',
  TRANSACTION_CONFIRMED = 'transaction_confirmed',
  TRANSACTION_FAILED = 'transaction_failed',
  PRICE_ALERT_TRIGGERED = 'price_alert_triggered',
  SECURITY_ALERT = 'security_alert',
  SYSTEM_ANNOUNCEMENT = 'system_announcement',
}

export enum NotificationChannel {
  WEBSOCKET = 'websocket',
  EMAIL = 'email',
}

@Entity('notifications')
@Index(['userId', 'createdAt'])
@Index(['userId', 'isRead'])
@Index(['type'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({
    type: 'enum',
    enum: NotificationEventType,
  })
  type: NotificationEventType;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ default: false })
  isRead: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;
}
