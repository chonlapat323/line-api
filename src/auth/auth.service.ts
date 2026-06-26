import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { buildFullPermissions, MenuPermission } from '../roles/roles.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { roleRef: true },
    });
    if (!user) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('อีเมลหรือรหัสผ่านไม่ถูกต้อง');

    const token = this.jwt.sign({
      id: user.id,
      email: user.email,
      role: user.role,
      roleId: user.roleId ?? null,
    });

    let permissions: MenuPermission[] = [];
    if (user.roleRef?.isActive) {
      permissions = buildFullPermissions(user.roleRef.permissions as Partial<MenuPermission>[]);
    } else if (user.role === 'admin') {
      // Legacy admin: grant all
      permissions = buildFullPermissions(
        Array(9).fill(null).map((_, i) => ({ canView: true, canEdit: true, canDelete: true })),
      );
    }

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        roleId: user.roleId ?? null,
        roleLabel: user.roleRef?.label ?? (user.role === 'admin' ? 'แอดมิน' : 'ผู้ใช้ทั่วไป'),
        permissions,
      },
    };
  }
}
