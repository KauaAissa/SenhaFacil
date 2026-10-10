import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import { Cron } from '@nestjs/schedule';

/** Argon2id parameters — OWASP 2023 recommendation for interactive logins */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65_536, // 64 MB
  timeCost: 3,
  parallelism: 4,
} satisfies argon2.Options;

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
    const email = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    });

    if (exists) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        phone: dto.phone?.trim() || undefined,
        passwordHash,
        kdfSalt: dto.kdfSalt,
        role: dto.role ?? 'ELDERLY',
      },
      select: { id: true, email: true, name: true, role: true, kdfSalt: true },
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('E-mail ou telefone ja cadastrado.');
      }
      throw error;
    });

    return {
      ...(await this.createSession(user)),
      user,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email.trim().toLowerCase(), mode: 'insensitive' } },
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

    const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role, kdfSalt: user.kdfSalt };

    return {
      ...(await this.createSession(user)),
      user: safeUser,
    };
  }

  private async createSession(user: { id: string; email: string; role: string }) {
    const sessionId = randomUUID();
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.authSession.create({ data: {
      id: sessionId, userId: user.id, refreshHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    } });
    return { accessToken: this.jwt.sign({ sub: user.id, email: user.email, role: user.role, sid: sessionId }), refreshToken };
  }

  async refresh(refreshToken: string) {
    const hash = hashToken(refreshToken);
    return this.prisma.serializable(async (transaction) => {
      const session = await transaction.authSession.findUnique({ where: { refreshHash: hash }, include: { user: true } });
      if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
        throw new UnauthorizedException('Sessao expirada. Entre novamente.');
      }
      const rotated = randomBytes(32).toString('base64url');
      const result = await transaction.authSession.updateMany({
        where: { id: session.id, refreshHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { refreshHash: hashToken(rotated) },
      });
      if (result.count !== 1) throw new UnauthorizedException('Token de renovacao ja utilizado.');
      return { refreshToken: rotated, accessToken: this.jwt.sign({ sub: session.userId,
        email: session.user.email, role: session.user.role, sid: session.id }) };
    });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.authSession.updateMany({ where: { refreshHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date(), fcmToken: null } });
  }

  @Cron('0 0 3 * * *')
  async cleanExpiredData(): Promise<void> {
    const now = new Date();
    await this.prisma.authSession.deleteMany({ where: { OR: [{ expiresAt: { lte: now } },
      { revokedAt: { lte: new Date(now.getTime() - 30 * 24 * 60 * 60_000) } }] } });
    await this.prisma.accessLog.deleteMany({ where: { status: { not: 'PENDING' },
      requestedAt: { lt: new Date(now.getTime() - 365 * 24 * 60 * 60_000) } } });
  }
}

function hashToken(token: string): string { return createHash('sha256').update(token).digest('hex'); }
