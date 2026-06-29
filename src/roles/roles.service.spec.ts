import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RolesService, buildFullPermissions, MENUS } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────
// buildFullPermissions (pure function)
// ─────────────────────────────────────────────────────────────────

describe('buildFullPermissions', () => {
  it('returns all menus with defaults false for empty input', () => {
    const result = buildFullPermissions([]);
    expect(result).toHaveLength(MENUS.length);
    expect(result.every((p) => !p.canView && !p.canEdit && !p.canDelete)).toBe(true);
  });

  it('inherits label from MENUS constant', () => {
    const result = buildFullPermissions([]);
    MENUS.forEach((m, i) => {
      expect(result[i].menu).toBe(m.menu);
      expect(result[i].label).toBe(m.label);
    });
  });

  it('applies partial override — canView only', () => {
    const result = buildFullPermissions([{ menu: 'dashboard', canView: true }]);
    const dash = result.find((p) => p.menu === 'dashboard');
    expect(dash?.canView).toBe(true);
    expect(dash?.canEdit).toBe(false);
    expect(dash?.canDelete).toBe(false);
  });

  it('applies multiple overrides independently', () => {
    const result = buildFullPermissions([
      { menu: 'dashboard', canView: true, canEdit: true },
      { menu: 'users', canView: true, canEdit: true, canDelete: true },
    ]);
    const dash = result.find((p) => p.menu === 'dashboard')!;
    const users = result.find((p) => p.menu === 'users')!;
    expect(dash.canEdit).toBe(true);
    expect(dash.canDelete).toBe(false);
    expect(users.canDelete).toBe(true);
  });

  it('ignores unknown menu keys in partial', () => {
    const result = buildFullPermissions([{ menu: 'nonexistent', canView: true } as any]);
    expect(result).toHaveLength(MENUS.length);
    expect(result.every((p) => !p.canView)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────
// RolesService
// ─────────────────────────────────────────────────────────────────

describe('RolesService', () => {
  let service: RolesService;
  let prismaRole: Record<string, jest.Mock>;

  beforeEach(async () => {
    prismaRole = {
      count:      jest.fn(),
      createMany: jest.fn(),
      findMany:   jest.fn(),
      findUnique: jest.fn(),
      create:     jest.fn(),
      update:     jest.fn(),
      delete:     jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: { role: prismaRole } },
      ],
    }).compile();

    service = module.get(RolesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── onModuleInit ──────────────────────────────────────────────
  describe('onModuleInit', () => {
    it('seeds default roles when none exist', async () => {
      prismaRole.count.mockResolvedValue(0);
      prismaRole.createMany.mockResolvedValue({ count: 2 });

      await service.onModuleInit();

      expect(prismaRole.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ name: 'admin', isSystem: true }),
            expect.objectContaining({ name: 'user', isSystem: false }),
          ]),
        }),
      );
    });

    it('skips seed when roles already exist', async () => {
      prismaRole.count.mockResolvedValue(5);
      await service.onModuleInit();
      expect(prismaRole.createMany).not.toHaveBeenCalled();
    });

    it('default admin role has all permissions true', async () => {
      prismaRole.count.mockResolvedValue(0);
      prismaRole.createMany.mockResolvedValue({ count: 2 });

      await service.onModuleInit();

      const adminData = prismaRole.createMany.mock.calls[0][0].data.find(
        (d: any) => d.name === 'admin',
      );
      expect(adminData.permissions.every((p: any) => p.canView && p.canEdit && p.canDelete)).toBe(true);
    });
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('creates a new role successfully', async () => {
      prismaRole.findUnique.mockResolvedValue(null);
      const created = { id: 'r1', name: 'manager', label: 'ผู้จัดการ' };
      prismaRole.create.mockResolvedValue(created);

      const result = await service.create({ name: 'manager', label: 'ผู้จัดการ', permissions: [] });
      expect(result).toBe(created);
    });

    it('throws BadRequestException when name already exists', async () => {
      prismaRole.findUnique.mockResolvedValue({ id: 'r1', name: 'admin' });

      await expect(
        service.create({ name: 'admin', label: 'แอดมิน', permissions: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores full permissions (all menus) even when partial input', async () => {
      prismaRole.findUnique.mockResolvedValue(null);
      prismaRole.create.mockResolvedValue({});

      await service.create({
        name: 'test',
        label: 'ทดสอบ',
        permissions: [{ menu: 'dashboard', canView: true }],
      });

      const stored = prismaRole.create.mock.calls[0][0].data.permissions;
      expect(stored).toHaveLength(MENUS.length);
      expect(stored.find((p: any) => p.menu === 'dashboard').canView).toBe(true);
      expect(stored.find((p: any) => p.menu === 'users').canView).toBe(false);
    });
  });

  // ── update ────────────────────────────────────────────────────
  describe('update', () => {
    it('updates label and isActive', async () => {
      const existing = { id: 'r1', name: 'user', label: 'ผู้ใช้' };
      prismaRole.findUnique.mockResolvedValue(existing);
      prismaRole.update.mockResolvedValue({ ...existing, label: 'ผู้ใช้ (แก้ไขแล้ว)', isActive: false });

      const result = await service.update('r1', { label: 'ผู้ใช้ (แก้ไขแล้ว)', isActive: false });
      expect(result.label).toBe('ผู้ใช้ (แก้ไขแล้ว)');
    });

    it('throws BadRequestException when role not found', async () => {
      prismaRole.findUnique.mockResolvedValue(null);
      await expect(service.update('nonexistent', { label: 'ใหม่' })).rejects.toThrow(BadRequestException);
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deletes role and returns ok', async () => {
      prismaRole.findUnique.mockResolvedValue({ id: 'r1', name: 'custom', isSystem: false, _count: { users: 0 } });
      prismaRole.delete.mockResolvedValue({});

      const result = await service.remove('r1');
      expect(result).toEqual({ ok: true });
      expect(prismaRole.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    });

    it('throws when role not found', async () => {
      prismaRole.findUnique.mockResolvedValue(null);
      await expect(service.remove('nonexistent')).rejects.toThrow(BadRequestException);
    });

    it('throws when role isSystem=true', async () => {
      prismaRole.findUnique.mockResolvedValue({ id: 'r1', name: 'admin', isSystem: true, _count: { users: 2 } });
      await expect(service.remove('r1')).rejects.toThrow('ไม่สามารถลบ Role ระบบได้');
    });

    it('throws when role has active users', async () => {
      prismaRole.findUnique.mockResolvedValue({ id: 'r1', name: 'user', isSystem: false, _count: { users: 3 } });
      await expect(service.remove('r1')).rejects.toThrow('3 ผู้ใช้');
    });
  });

  // ── getPermissionsForUser ─────────────────────────────────────
  describe('getPermissionsForUser', () => {
    it('returns full permission list for active role', async () => {
      prismaRole.findUnique.mockResolvedValue({
        id: 'r1',
        isActive: true,
        permissions: [{ menu: 'dashboard', canView: true, canEdit: false, canDelete: false }],
      });

      const result = await service.getPermissionsForUser('r1');
      expect(result).toHaveLength(MENUS.length);
      expect(result.find((p) => p.menu === 'dashboard')?.canView).toBe(true);
    });

    it('returns empty array for inactive role', async () => {
      prismaRole.findUnique.mockResolvedValue({ id: 'r1', isActive: false, permissions: [] });
      const result = await service.getPermissionsForUser('r1');
      expect(result).toEqual([]);
    });

    it('returns empty array when role not found', async () => {
      prismaRole.findUnique.mockResolvedValue(null);
      const result = await service.getPermissionsForUser('r1');
      expect(result).toEqual([]);
    });
  });
});
