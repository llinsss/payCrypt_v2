import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true, length: 32 })
  twoFactorSecret: string;

  @Column({ default: false })
  @Index("idx_users_2fa_enabled", { where: "two_factor_enabled = true" })
  twoFactorEnabled: boolean;

  @Column("text", { array: true, nullable: true })
  backupCodes: string[];

  @Column({ nullable: true })
  twoFactorEnabledAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
