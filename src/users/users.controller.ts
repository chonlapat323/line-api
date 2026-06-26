import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles({ menu: 'users', action: 'canView' })
  findAll() {
    return this.usersService.findAll();
  }

  @Get('me')
  getMe(@Request() req) {
    return this.usersService.findById(req.user.id);
  }

  @Patch('me')
  updateMe(@Request() req, @Body() body: { bankName?: string; bankAccount?: string }) {
    return this.usersService.updateMe(req.user.id, body);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles({ menu: 'users', action: 'canEdit' })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'users', action: 'canEdit' })
  update(
    @Param('id') id: string,
    @Body() body: {
      fullName?: string; email?: string; role?: string; roleId?: string | null;
      password?: string; bankName?: string; bankAccount?: string;
    },
  ) {
    return this.usersService.updateUser(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles({ menu: 'users', action: 'canDelete' })
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }

  @Get(':id/verification-code')
  getVerificationCode(@Param('id') id: string) {
    return this.usersService.generateVerificationCode(id);
  }
}
