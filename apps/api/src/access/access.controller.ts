import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards, Param, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessService } from './access.service';
import { RequestAccessDto } from './dto/request-access.dto';
import { RespondAccessDto } from './dto/respond-access.dto';
import { EmergencyAccessDto } from './dto/emergency-access.dto';

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
    if (req.user.role !== 'ELDERLY') throw new ForbiddenException();
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
    if (req.user.role !== 'CAREGIVER') throw new ForbiddenException();
    return this.accessService.respondToAccess(req.user.id, dto);
  }

  /**
   * GET /access/pending
   *
   * Called by the caregiver's app to list outstanding access requests —
   * a fallback in case the FCM push was missed, delayed, or the caregiver
   * simply opens the app directly.
   */
  @Get('pending')
  findPending(@Req() req: AuthRequest) {
    if (req.user.role !== 'CAREGIVER') throw new ForbiddenException();
    return this.accessService.findPendingForCaregiver(req.user.id);
  }

  @Get('history')
  history(@Req() req: AuthRequest) { return this.accessService.history(req.user.id); }

  @Post('emergency')
  emergency(@Req() req: AuthRequest, @Body() dto: EmergencyAccessDto) {
    if (req.user.role !== 'ELDERLY') throw new ForbiddenException();
    return this.accessService.recordEmergency(req.user.id, dto);
  }

  @Get(':id')
  state(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.accessService.findState(req.user.id, id);
  }
}
