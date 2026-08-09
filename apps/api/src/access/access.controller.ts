import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessService } from './access.service';
import { RequestAccessDto } from './dto/request-access.dto';
import { RespondAccessDto } from './dto/respond-access.dto';

interface AuthRequest {
  user: { id: string; role: string };
}

@Controller('access')
@UseGuards(JwtAuthGuard)
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  /**
   * POST /access/request
   *
   * Called by the elderly user's app when they try to open a vault item
   * that has requiresApproval=true.
   *
   * Creates an AccessLog (PENDING) and sends an FCM push to all active
   * caregivers with the APPROVE_ACCESS permission.
   */
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  requestAccess(@Req() req: AuthRequest, @Body() dto: RequestAccessDto) {
    return this.accessService.requestAccess(req.user.id, dto);
  }

  /**
   * POST /access/respond
   *
   * Called by the caregiver's app after tapping the push notification.
   * Updates the AccessLog status and notifies the elderly user in real-time
   * via WebSocket (with FCM as fallback).
   */
  @Post('respond')
  @HttpCode(HttpStatus.OK)
  respondToAccess(@Req() req: AuthRequest, @Body() dto: RespondAccessDto) {
    return this.accessService.respondToAccess(req.user.id, dto);
  }
}
