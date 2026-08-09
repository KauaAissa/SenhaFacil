import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';

/** Argon2id parameters — OWASP 2023 recommendation for interactive logins */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65_536, // 64 MB
  timeCost: 3,
  parallelism: 4,
};

/**
 * Pre-computed hash used for constant-time password verification even when
 * no user is found — prevents timing-based user enumeration attacks.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHlzYWx0c2FsdHk$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (exists) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        kdfSalt: dto.kdfSalt,
        role: dto.role ?? 'ELDERLY',
      },
      select: { id: true, email: true, name: true, role: true, kdfSalt: true },
    });

    return {
      accessToken: this.signToken(user.id, user.email, user.role),
      user,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        kdfSalt: true,
        passwordHash: true,
        isActive: true,
      },
    });

    // Always run argon2.verify regardless of whether the user exists.
    // This ensures constant response time and prevents user enumeration via timing.
    const hashToVerify = user?.passwordHash ?? DUMMY_HASH;
    const isValid = await argon2.verify(hashToVerify, dto.password);

    if (!user || !isValid || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _removed, ...safeUser } = user;

    return {
      accessToken: this.signToken(user.id, user.email, user.role),
      user: safeUser,
    };
  }

  private signToken(userId: string, email: string, role: string): string {
    return this.jwt.sign({ sub: userId, email, role });
  }
}
