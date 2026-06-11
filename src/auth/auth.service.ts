import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    const token = this.jwt.sign({ id: user.id, email: user.email, role: user.role });
    return {
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role },
    };
  }
}
