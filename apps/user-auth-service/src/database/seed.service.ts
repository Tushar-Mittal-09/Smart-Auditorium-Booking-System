import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, Permission } from '../entities';

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async onModuleInit() {
    this.logger.log('Running database seed...');
    await this.seedPermissions();
    await this.seedRoles();
    this.logger.log('Database seed completed successfully.');
  }

  private async seedPermissions() {
    const permissions = [
      { name: 'event:read', resource: 'event', action: 'read', description: 'Read events' },
      { name: 'event:create', resource: 'event', action: 'create', description: 'Create events' },
      { name: 'event:update', resource: 'event', action: 'update', description: 'Update events' },
      { name: 'event:delete', resource: 'event', action: 'delete', description: 'Delete events' },
      { name: 'booking:create', resource: 'booking', action: 'create', description: 'Create bookings' },
      { name: 'booking:read', resource: 'booking', action: 'read', description: 'Read bookings' },
      { name: 'booking:manage', resource: 'booking', action: 'manage', description: 'Manage all bookings' },
      { name: 'user:read', resource: 'user', action: 'read', description: 'Read users' },
      { name: 'user:update', resource: 'user', action: 'update', description: 'Update users' },
      { name: 'admin:dashboard', resource: 'admin', action: 'dashboard', description: 'Access admin dashboard' },
      { name: 'admin:manage-users', resource: 'admin', action: 'manage-users', description: 'Manage users' },
      { name: 'admin:approve-events', resource: 'admin', action: 'approve-events', description: 'Approve events' },
      { name: 'audit:read', resource: 'audit', action: 'read', description: 'Read audit logs' },
    ];

    for (const perm of permissions) {
      await this.permissionRepository
        .createQueryBuilder()
        .insert()
        .into(Permission)
        .values(perm)
        .orIgnore() // Identical to ON CONFLICT DO NOTHING
        .execute();
    }
  }

  private async seedRoles() {
    // 1. Fetch all permissions to map them
    const allPerms = await this.permissionRepository.find();
    const permMap = new Map(allPerms.map((p) => [p.name, p]));

    // Helper to get permission entities by array of names
    const getPerms = (names: string[]) => {
      return names.map((name) => permMap.get(name)).filter(Boolean) as Permission[];
    };

    const rolesData = [
      {
        name: 'STUDENT',
        description: 'Standard student role',
        permissions: getPerms(['event:read', 'booking:create', 'booking:read', 'user:read', 'user:update']),
      },
      {
        name: 'ORGANIZER',
        description: 'Event organizer role',
        permissions: getPerms([
          'event:read', 'booking:create', 'booking:read', 'user:read', 'user:update',
          'event:create', 'event:update', 'booking:manage',
        ]),
      },
      {
        name: 'ADMIN',
        description: 'Administrator role',
        permissions: allPerms, // Auto-gets all seeded permissions
      },
    ];

    for (const roleData of rolesData) {
      let role = await this.roleRepository.findOne({ where: { name: roleData.name }, relations: ['permissions'] });
      
      if (!role) {
        // Create role if missing
        role = this.roleRepository.create({
          name: roleData.name,
          description: roleData.description,
          permissions: roleData.permissions,
        });
        await this.roleRepository.save(role);
      } else {
        // Update permissions if it exists
        // (For a robust seed, we update permissions on every boot to keep them synced)
        role.permissions = roleData.permissions;
        await this.roleRepository.save(role);
      }
    }
  }
}
