import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateFcmTokenDto } from './dto/update-fcm-token.dto';

interface AuthRequest {
  user: { id: string };
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

  /**
   * PATCH /users/me/fcm-token
   * Registers/refreshes the device's FCM push token.
   * Required for both elderly (access resolution push) and caregiver
   * (access request push) notification delivery.
   */
  @Patch('me/fcm-token')
  updateFcmToken(@Req() req: AuthRequest, @Body() dto: UpdateFcmTokenDto) {
    return this.usersService.updateFcmToken(req.user.id, dto.fcmToken);
  }
}
