import { Injectable, BadRequestException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type MenuPermission = {
  menu: string;
  label: string;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export const MENUS: { menu: string; label: string }[] = [
  { menu: 'dashboard', label: 'ภาพรวม' },
  { menu: 'sales', label: 'สถิติเซล' },
  { menu: 'visits', label: 'ประวัติการเยี่ยม' },
  { menu: 'approvals', label: 'จัดการสลิป' },
  { menu: 'commissions', label: 'ค่าคอมมิชชัน' },
  { menu: 'users', label: 'จัดการ Users' },
  { menu: 'roles', label: 'จัดการสิทธิ์' },
  { menu: 'settings', label: 'ตั้งค่า' },
  { menu: 'line', label: 'LINE' },
];

export function buildFullPermissions(partial: Partial<MenuPermission>[] = []): MenuPermission[] {
  return MENUS.map((m) => {
    const found = partial.find((p) => p.menu === m.menu);
    return {
      menu: m.menu,
      label: m.label,
      canView: found?.canView ?? false,
      canEdit: found?.canEdit ?? false,
      canDelete: found?.canDelete ?? false,
    };
  });
}

@Injectable()
export class RolesService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    const count = await this.prisma.role.count();
    if (count === 0) await this.seedDefaults();
  }

  private async seedDefaults() {
    const allTrue = MENUS.map((m) => ({ menu: m.menu, label: m.label, canView: true, canEdit: true, canDelete: true }));
    const viewOnly = MENUS.map((m) => ({
      menu: m.menu,
      label: m.label,
      canView: ['dashboard', 'visits', 'commissions'].includes(m.menu),
      canEdit: false,
      canDelete: false,
    }));

    await this.prisma.role.createMany({
      data: [
        { name: 'admin', label: 'แอดมิน', permissions: allTrue, isSystem: true, isActive: true },
        { name: 'user', label: 'ผู้ใช้ทั่วไป', permissions: viewOnly, isSystem: false, isActive: true },
      ],
    });
  }

  getMenus() {
    return MENUS;
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return roles.map((r) => ({ ...r, userCount: r._count.users }));
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new BadRequestException('ไม่พบ Role นี้');
    return role;
  }

  async create(data: { name: string; label: string; permissions: Partial<MenuPermission>[] }) {
    const existing = await this.prisma.role.findUnique({ where: { name: data.name } });
    if (existing) throw new BadRequestException('ชื่อ Role นี้มีอยู่แล้ว');

    return this.prisma.role.create({
      data: {
        name: data.name,
        label: data.label,
        permissions: buildFullPermissions(data.permissions),
      },
    });
  }

  async update(id: string, data: { label?: string; permissions?: Partial<MenuPermission>[]; isActive?: boolean }) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new BadRequestException('ไม่พบ Role นี้');

    const updateData: any = {};
    if (data.label !== undefined) updateData.label = data.label;
    if (data.permissions !== undefined) updateData.permissions = buildFullPermissions(data.permissions);
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.role.update({ where: { id }, data: updateData });
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new BadRequestException('ไม่พบ Role นี้');
    if (role.isSystem) throw new BadRequestException('ไม่สามารถลบ Role ระบบได้');
    if (role._count.users > 0) throw new BadRequestException(`ไม่สามารถลบได้ มี ${role._count.users} ผู้ใช้ใช้ Role นี้อยู่`);

    await this.prisma.role.delete({ where: { id } });
    return { ok: true };
  }

  async getPermissionsForUser(roleId: string): Promise<MenuPermission[]> {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role || !role.isActive) return [];
    return buildFullPermissions(role.permissions as Partial<MenuPermission>[]);
  }
}
