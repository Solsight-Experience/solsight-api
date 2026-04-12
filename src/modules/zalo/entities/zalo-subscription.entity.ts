import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('zalo_subscriptions')
@Index(['userId'], { unique: true })
@Index(['verificationToken'])
export class ZaloSubscription {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'varchar' })
    userId: string;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    user: User;

    @Column({ type: 'varchar', nullable: true })
    zaloUserId: string | null;

    @Column({ type: 'varchar', nullable: true })
    verificationToken: string | null;

    @Column({ type: 'timestamp', nullable: true })
    tokenExpiresAt: Date | null;

    @Column({ default: false })
    isVerified: boolean;

    @Column({ type: 'timestamp', nullable: true })
    verifiedAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
