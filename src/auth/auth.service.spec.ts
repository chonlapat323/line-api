import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('bcryptjs');

const mockUser = {
  id: 'cuid_user_1',
  email: 'sales@beautyup.com',
  passwordHash: '$2a$10$hashedpassword',
  fullName: 'สมชาย ใจดี',
  role: 'user',
};

describe('AuthService.login', () => {
  let service: AuthService;
  let prismaFindUnique: jest.Mock;
  let jwtSign: jest.Mock;

  beforeEach(async () => {
    prismaFindUnique = jest.fn();
    jwtSign = jest.fn().mockReturnValue('mock.jwt.token');

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { user: { findUnique: prismaFindUnique } } },
        { provide: JwtService, useValue: { sign: jwtSign } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────
  // กรณีล้มเหลว
  // ─────────────────────────────────────────────

  it('ไม่พบ email ในระบบ → UnauthorizedException', async () => {
    prismaFindUnique.mockResolvedValue(null);

    await expect(service.login('notfound@test.com', 'password')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('ข้อความ error เป็นภาษาไทย', async () => {
    prismaFindUnique.mockResolvedValue(null);

    await expect(service.login('x@x.com', 'p')).rejects.toThrow(
      'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    );
  });

  it('รหัสผ่านผิด → UnauthorizedException', async () => {
    prismaFindUnique.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(service.login(mockUser.email, 'wrongpass')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('รหัสผ่านผิด → ข้อความ error เดียวกัน (ไม่ระบุว่าเป็น email หรือ password ผิด)', async () => {
    prismaFindUnique.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(service.login(mockUser.email, 'wrongpass')).rejects.toThrow(
      'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    );
  });

  // ─────────────────────────────────────────────
  // กรณีสำเร็จ
  // ─────────────────────────────────────────────

  it('credentials ถูก → คืน token', async () => {
    prismaFindUnique.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login(mockUser.email, 'correct');

    expect(result.token).toBe('mock.jwt.token');
  });

  it('credentials ถูก → คืน user object (ไม่มี passwordHash)', async () => {
    prismaFindUnique.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.login(mockUser.email, 'correct');

    expect(result.user).toEqual({
      id: mockUser.id,
      email: mockUser.email,
      fullName: mockUser.fullName,
      role: mockUser.role,
    });
    expect(result.user).not.toHaveProperty('passwordHash');
  });

  // ─────────────────────────────────────────────
  // JWT payload
  // ─────────────────────────────────────────────

  it('JWT sign ได้รับ payload ที่ถูกต้อง: id, email, role', async () => {
    prismaFindUnique.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await service.login(mockUser.email, 'correct');

    expect(jwtSign).toHaveBeenCalledWith({
      id: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
    });
  });

  it('admin login → JWT payload มี role: admin', async () => {
    const adminUser = { ...mockUser, id: 'cuid_admin_1', email: 'admin@beautyup.com', role: 'admin' };
    prismaFindUnique.mockResolvedValue(adminUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await service.login(adminUser.email, 'correct');

    expect(jwtSign).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin' }));
  });

  it('JWT payload ไม่มี passwordHash รั่ว', async () => {
    prismaFindUnique.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await service.login(mockUser.email, 'correct');

    const payload = jwtSign.mock.calls[0][0];
    expect(payload).not.toHaveProperty('passwordHash');
  });

  // ─────────────────────────────────────────────
  // bcrypt
  // ─────────────────────────────────────────────

  it('เรียก bcrypt.compare ด้วย plaintext password และ hash จาก DB', async () => {
    prismaFindUnique.mockResolvedValue(mockUser);
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await service.login(mockUser.email, 'myplaintext');

    expect(bcrypt.compare).toHaveBeenCalledWith('myplaintext', mockUser.passwordHash);
  });
});
