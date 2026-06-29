import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('menus')
  getMenus() {
    return this.rolesService.getMenus();
  }

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Post()
  @Roles({ menu: 'roles', action: 'canEdit' })
  create(@Body() body: { name: string; label: string; permissions: any[] }) {
    return this.rolesService.create(body);
  }

  @Patch(':id')
  @Roles({ menu: 'roles', action: 'canEdit' })
  update(@Param('id') id: string, @Body() body: { label?: string; permissions?: any[]; isActive?: boolean }) {
    return this.rolesService.update(id, body);
  }

  @Delete(':id')
  @Roles({ menu: 'roles', action: 'canDelete' })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
