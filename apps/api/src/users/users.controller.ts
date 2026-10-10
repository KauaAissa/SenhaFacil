import { Body, Controller, Delete, Get, HttpCode, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';
import { DeleteAccountDto, UpdateProfileDto } from './dto/update-profile.dto';

interface AuthRequest {
  user: { id: string; sessionId: string };
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /users/me — current authenticated user's profile. */
  @Get('me')
  getProfile(@Req() req: AuthRequest) {
    return this.usersService.getProfile(req.user.id);
  }

  @Patch('me')
  updateProfile(@Req() req: AuthRequest, @Body() dto: UpdateProfileDto) { return this.usersService.updateProfile(req.user.id, dto); }

  @Delete('me')
  @HttpCode(204)
  deleteAccount(@Req() req: AuthRequest, @Body() dto: DeleteAccountDto) { return this.usersService.deleteAccount(req.user.id, dto.password); }

  /**
   * PATCH /users/me/fcm-token
   * Registers/refreshes the device's FCM push token.
   * Required for both elderly (access resolution push) and caregiver
   * (access request push) notification delivery.
   */
  @Patch('me/fcm-token')
  updateFcmToken(@Req() req: AuthRequest, @Body() dto: UpdateFcmTokenDto) {
    return this.usersService.updateFcmToken(req.user.id, req.user.sessionId, dto.fcmToken);
  }
}
