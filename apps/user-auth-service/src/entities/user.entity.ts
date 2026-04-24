import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  CreateDateColumn, 
  UpdateDateColumn, 
  DeleteDateColumn,
  ManyToMany,
  JoinTable,
  Index 
} from 'typeorm';
import { Role } from './role.entity';
import { EncryptionTransformer } from '@sabs/shared';

@Entity('users')
@Index(['is_active', 'deleted_at'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password_hash: string;

  @Column({ nullable: true })
  first_name: string;

  @Column({ nullable: true })
  last_name: string;

  @Column({ default: false })
  is_email_verified: boolean;

  @Column({ default: false })
  is_mfa_enabled: boolean;

  @Column({ nullable: true, transformer: new EncryptionTransformer() })
  mfa_secret: string;

  @Column('text', { array: true, nullable: true })
  mfa_backup_codes: string[];

  @Column({ unique: true, nullable: true })
  @Index({ where: 'google_id IS NOT NULL' })
  google_id: string;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: 0 })
  token_version: number;

  @Column({ type: 'timestamp', nullable: true })
  last_login_at: Date;

  @Column({ nullable: true })
  last_login_ip: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at: Date;

  @ManyToMany(() => Role)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' }
  })
  roles: Role[];
}
