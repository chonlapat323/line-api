import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { PrismaService } from '../prisma/prisma.service';

function buildContext(user: any): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

const activeRole = {
  id: 'r1',
  name: 'manager',
  isActive: true,
  permissions: [
    { menu: 'users',       label: 'จัดการ Users', canView: true,  canEdit: true,  canDelete: false },
    { menu: 'dashboard',   label: 'ภาพรวม',        canView: true,  canEdit: false, canDelete: false },
    { menu: 'commissions', label: 'ค่าคอมมิชชัน',   canView: true,  canEdit: false, canDelete: false },
  ],
};

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflectorGet: jest.Mock;
  let prismaFindUnique: jest.Mock;

  beforeEach(async () => {
    reflectorGet   = jest.fn();
    prismaFindUnique = jest.fn();

    const module = await Test.createTestingModule({
      providers: [
        RolesGuard,
        { provide: Reflector,     useValue: { get: reflectorGet } },
        { provide: PrismaService, useValue: { role: { findUnique: prismaFindUnique } } },
      ],
    }).compile();

    guard = module.get(RolesGuard);
  });

  afterEach(() => jest.clearAllMocks());

  // ── No guard metadata ─────────────────────────────────────────
  it('no @Roles decorator → allows request', async () => {
    reflectorGet.mockReturnValue(undefined);
    await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user' }))).resolves.toBe(true);
  });

  it('empty @Roles([]) → allows request', async () => {
    reflectorGet.mockReturnValue([]);
    await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user' }))).resolves.toBe(true);
  });

  // ── No user ───────────────────────────────────────────────────
  it('no user in request → denies', async () => {
    reflectorGet.mockReturnValue([{ menu: 'users', action: 'canView' }]);
    await expect(guard.canActivate(buildContext(null))).resolves.toBe(false);
  });

  // ── Legacy fallback (no roleId) ───────────────────────────────
  describe('legacy fallback (no roleId)', () => {
    it('admin role satisfies string requirement', async () => {
      reflectorGet.mockReturnValue(['admin']);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'admin' }))).resolves.toBe(true);
    });

    it('user role fails string requirement for admin', async () => {
      reflectorGet.mockReturnValue(['admin']);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user' }))).resolves.toBe(false);
    });

    it('admin role satisfies menu requirement (legacy admin = all)', async () => {
      reflectorGet.mockReturnValue([{ menu: 'users', action: 'canEdit' }]);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'admin' }))).resolves.toBe(true);
    });

    it('non-admin role fails menu requirement (legacy)', async () => {
      reflectorGet.mockReturnValue([{ menu: 'users', action: 'canEdit' }]);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user' }))).resolves.toBe(false);
    });
  });

  // ── With roleId → DB check ────────────────────────────────────
  describe('with roleId (DB permission check)', () => {
    it('role not found in DB → denies', async () => {
      reflectorGet.mockReturnValue([{ menu: 'users', action: 'canView' }]);
      prismaFindUnique.mockResolvedValue(null);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user', roleId: 'r1' }))).resolves.toBe(false);
    });

    it('isActive=false → denies', async () => {
      reflectorGet.mockReturnValue([{ menu: 'users', action: 'canView' }]);
      prismaFindUnique.mockResolvedValue({ ...activeRole, isActive: false });
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user', roleId: 'r1' }))).resolves.toBe(false);
    });

    it('canView=true → allows', async () => {
      reflectorGet.mockReturnValue([{ menu: 'users', action: 'canView' }]);
      prismaFindUnique.mockResolvedValue(activeRole);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user', roleId: 'r1' }))).resolves.toBe(true);
    });

    it('canEdit=true → allows', async () => {
      reflectorGet.mockReturnValue([{ menu: 'users', action: 'canEdit' }]);
      prismaFindUnique.mockResolvedValue(activeRole);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user', roleId: 'r1' }))).resolves.toBe(true);
    });

    it('canDelete=false → denies', async () => {
      reflectorGet.mockReturnValue([{ menu: 'users', action: 'canDelete' }]);
      prismaFindUnique.mockResolvedValue(activeRole);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user', roleId: 'r1' }))).resolves.toBe(false);
    });

    it('menu not in permissions list → denies', async () => {
      reflectorGet.mockReturnValue([{ menu: 'roles', action: 'canView' }]);
      prismaFindUnique.mockResolvedValue(activeRole); // activeRole has no 'roles' entry
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user', roleId: 'r1' }))).resolves.toBe(false);
    });

    it('string requirement matches role.name → allows', async () => {
      reflectorGet.mockReturnValue(['manager']);
      prismaFindUnique.mockResolvedValue(activeRole);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'manager', roleId: 'r1' }))).resolves.toBe(true);
    });

    it('multiple requirements — all must pass', async () => {
      reflectorGet.mockReturnValue([
        { menu: 'users', action: 'canView' },
        { menu: 'users', action: 'canEdit' },
      ]);
      prismaFindUnique.mockResolvedValue(activeRole);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user', roleId: 'r1' }))).resolves.toBe(true);
    });

    it('multiple requirements — one fails → denies', async () => {
      reflectorGet.mockReturnValue([
        { menu: 'users', action: 'canView' },
        { menu: 'users', action: 'canDelete' }, // canDelete=false
      ]);
      prismaFindUnique.mockResolvedValue(activeRole);
      await expect(guard.canActivate(buildContext({ id: 'u1', role: 'user', roleId: 'r1' }))).resolves.toBe(false);
    });
  });
});
