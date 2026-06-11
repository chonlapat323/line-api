import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, fullName: true, role: true, createdAt: true },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, fullName: true, role: true },
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('อีเมลนี้ถูกใช้แล้ว');

    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash: hash, fullName: dto.fullName, role: dto.role || 'user' },
    });
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
  }

  async generateVerificationCode(userId: string) {
    const code = `BU-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const verif = await this.prisma.lineVerificationCode.create({
      data: { userId, code, expiresAt },
    });
    return { code: verif.code, expiresAt: verif.expiresAt };
  }
}
