import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Apply this guard to any controller or route handler that requires a valid JWT.
 *
 * @example
 * \@UseGuards(JwtAuthGuard)
 * \@Get('profile')
 * getProfile(@Req() req: Request) { return req.user; }
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
