import { BadRequestException, Body, Controller, Get, Header, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SecurityService } from './security.service';
import { RevokeSecuritySessionsDto, SecurityReportsDto } from './security.dto';

interface AuthRequest { user: { id: string; sessionId: string } }

@Controller('security')
@UseGuards(JwtAuthGuard)
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @Get('events')
  @Header('Cache-Control', 'no-store')
  events(@Req() request: AuthRequest, @Query('cursor') cursor?: string) {
    if (cursor && !/^[A-Za-z0-9_-]{1,100}$/.test(cursor)) throw new BadRequestException('Pagina invalida.');
    return this.security.events(request.user.id, cursor);
  }

  @Post('reports')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  reports(@Req() request: AuthRequest, @Body() dto: SecurityReportsDto) {
    return this.security.recordReports(request.user.id, dto.reports);
  }

  @Get('sessions')
  @Header('Cache-Control', 'no-store')
  sessions(@Req() request: AuthRequest) { return this.security.sessions(request.user.id, request.user.sessionId); }

  @Post('sessions/revoke')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  revoke(@Req() request: AuthRequest, @Body() dto: RevokeSecuritySessionsDto) {
    return this.security.revokeSessions(request.user.id, request.user.sessionId, dto);
  }
}
