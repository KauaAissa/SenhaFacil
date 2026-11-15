import { Body, Controller, ForbiddenException, Get, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PasswordAiService } from './password-ai.service';

interface AuthRequest { user: { id: string; role: string } }

@Controller('ai/password')
@UseGuards(JwtAuthGuard)
export class PasswordAiController {
  constructor(private readonly service: PasswordAiService) {}

  @Get('status')
  @Header('Cache-Control', 'no-store')
  status(@Req() req: AuthRequest) {
    if (req.user.role !== 'ELDERLY') throw new ForbiddenException();
    return this.service.status();
  }

  @Post('suggestion')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  recommend(@Req() req: AuthRequest, @Body() body: unknown) {
    if (req.user.role !== 'ELDERLY') throw new ForbiddenException();
    return this.service.recommend(req.user.id, body);
  }
}
