import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

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
}
