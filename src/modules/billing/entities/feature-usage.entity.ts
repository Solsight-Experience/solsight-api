import { Entity, PrimaryColumn, Column } from "typeorm";

@Entity("feature_usage")
export class FeatureUsage {
    @PrimaryColumn({ type: "varchar" })
    userId: string;

    @PrimaryColumn({ type: "date" })
    usageDate: string;

    @Column({ type: "int", default: 0 })
    count: number;
}
