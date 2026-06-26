import { SetMetadata } from '@nestjs/common';

export type RoleRequirement =
  | string
  | { menu: string; action: 'canView' | 'canEdit' | 'canDelete' };

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleRequirement[]) => SetMetadata(ROLES_KEY, roles);
