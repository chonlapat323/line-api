import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcryptjs');

describe('UsersService', () => {
  let service: UsersService;
  let prismaUser: Record<string, jest.Mock>;

  beforeEach(async () => {
    prismaUser = {
      findMany:   jest.fn(),
      findUnique: jest.fn(),
      update:     jest.fn(),
      create:     jest.fn(),
      delete:     jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: {
            user: prismaUser,
            lineVerificationCode: { create: jest.fn() },
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── findAll ───────────────────────────────────────────────────
  describe('findAll', () => {
    it('returns list of users from DB', async () => {
      const users = [{ id: 'u1', email: 'a@b.com', role: 'user', roleId: null, roleRef: null }];
      prismaUser.findMany.mockResolvedValue(users);
      await expect(service.findAll()).resolves.toBe(users);
    });
  });

  // ── findById ──────────────────────────────────────────────────
  describe('findById', () => {
    it('queries by id and returns user', async () => {
      const user = { id: 'u1', email: 'a@b.com', role: 'user' };
      prismaUser.findUnique.mockResolvedValue(user);
      const result = await service.findById('u1');
      expect(result).toBe(user);
      expect(prismaUser.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'u1' } }),
      );
    });
  });

  // ── updateUser ────────────────────────────────────────────────
  describe('updateUser', () => {
    it('sets roleId when provided', async () => {
      prismaUser.update.mockResolvedValue({ id: 'u1', roleId: 'r1' });
      await service.updateUser('u1', { roleId: 'r1' });
      const updateData = prismaUser.update.mock.calls[0][0].data;
      expect(updateData.roleId).toBe('r1');
    });

    it('clears roleId when null is passed', async () => {
      prismaUser.update.mockResolvedValue({ id: 'u1', roleId: null });
      await service.updateUser('u1', { roleId: null });
      const updateData = prismaUser.update.mock.calls[0][0].data;
      expect(updateData.roleId).toBeNull();
    });

    it('omits roleId from updateData when not passed', async () => {
      prismaUser.update.mockResolvedValue({ id: 'u1' });
      await service.updateUser('u1', { fullName: 'ใหม่' });
      const updateData = prismaUser.update.mock.calls[0][0].data;
      expect(updateData).not.toHaveProperty('roleId');
    });

    it('hashes password and stores as passwordHash', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_pw');
      prismaUser.update.mockResolvedValue({ id: 'u1' });
      await service.updateUser('u1', { password: 'newpass' });
      expect(bcrypt.hash).toHaveBeenCalledWith('newpass', 10);
      const updateData = prismaUser.update.mock.calls[0][0].data;
      expect(updateData.passwordHash).toBe('hashed_pw');
      expect(updateData).not.toHaveProperty('password');
    });

    it('updates fullName and email together', async () => {
      prismaUser.update.mockResolvedValue({ id: 'u1' });
      await service.updateUser('u1', { fullName: 'สมชาย', email: 'new@test.com' });
      const updateData = prismaUser.update.mock.calls[0][0].data;
      expect(updateData.fullName).toBe('สมชาย');
      expect(updateData.email).toBe('new@test.com');
    });
  });

  // ── create ────────────────────────────────────────────────────
  describe('create', () => {
    it('creates user with hashed password, returns without passwordHash', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
      prismaUser.findUnique.mockResolvedValue(null);
      prismaUser.create.mockResolvedValue({
        id: 'u1', email: 'new@test.com', fullName: 'ใหม่', role: 'user',
      });

      const result = await service.create({ email: 'new@test.com', password: 'pass', fullName: 'ใหม่' });
      expect(result.email).toBe('new@test.com');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws ConflictException when email already exists', async () => {
      prismaUser.findUnique.mockResolvedValue({ id: 'u1', email: 'existing@test.com' });
      await expect(
        service.create({ email: 'existing@test.com', password: 'pass', fullName: 'มีอยู่แล้ว' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── remove ────────────────────────────────────────────────────
  describe('remove', () => {
    it('deletes user and returns success', async () => {
      prismaUser.delete.mockResolvedValue({});
      await expect(service.remove('u1')).resolves.toEqual({ success: true });
      expect(prismaUser.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    });
  });
});
