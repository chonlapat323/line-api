import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_KEY, RoleRequirement } from './roles.decorator';
import { MenuPermission } from '../roles/roles.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<RoleRequirement[]>(ROLES_KEY, context.getHandler());
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // Legacy fallback: no roleId → check role string
    if (!user.roleId) {
      return required.every((r) =>
        typeof r === 'string' ? user.role === r : user.role === 'admin',
      );
    }

    const role = await this.prisma.role.findUnique({ where: { id: user.roleId } });
    if (!role || !role.isActive) return false;

    const permissions = role.permissions as MenuPermission[];

    return required.every((r) => {
      if (typeof r === 'string') return role.name === r || user.role === r;
      const perm = permissions.find((p) => p.menu === r.menu);
      return perm?.[r.action] === true;
    });
  }
}
