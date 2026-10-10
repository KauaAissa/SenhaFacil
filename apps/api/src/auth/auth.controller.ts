import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthParametersDto, RecoveryProofDto, RecoverAccountDto, SecurityUpdateDto } from './dto/vault-protection.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/register
   * Creates a new user account. Returns a JWT and the kdfSalt.
   */
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 requests/min per IP
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /auth/login
   * Authenticates a user. Returns a JWT and the kdfSalt (used for key derivation on new devices).
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 requests/min per IP
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('parameters')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  parameters(@Body() dto: AuthParametersDto) { return this.authService.parameters(dto.email); }

  @Post('recovery-info')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  recoveryInfo(@Body() dto: RecoveryProofDto) { return this.authService.recoveryInfo(dto); }

  @Post('recover')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  recover(@Body() dto: RecoverAccountDto) { return this.authService.recover(dto); }

  @Post('security')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  security(@Req() request: { user: { id: string } }, @Body() dto: SecurityUpdateDto) {
    return this.authService.updateSecurity(request.user.id, dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  refresh(@Body() dto: RefreshTokenDto) { return this.authService.refresh(dto.refreshToken, dto.requestId); }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshTokenDto) { return this.authService.logout(dto.refreshToken); }
}
