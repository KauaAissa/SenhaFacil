import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import { Cron } from '@nestjs/schedule';
import type { RecoverAccountDto, RecoveryProofDto, SecurityUpdateDto } from './dto/vault-protection.dto';

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
    private readonly config: ConfigService = new ConfigService(),
  ) {}

  async register(dto: RegisterDto) {
    if (dto.authVersion !== 2 || dto.kdfSalt !== dto.protection?.salt) throw new BadRequestException('Configuracao de seguranca invalida.');
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
        authVersion: 2, securityVersion: 1, vaultProtection: JSON.parse(JSON.stringify(dto.protection)),
        recoveryHash: await argon2.hash(dto.recoveryCredential, ARGON2_OPTIONS),
      },
      select: { id: true, email: true, name: true, role: true, kdfSalt: true, authVersion: true, securityVersion: true, vaultProtection: true },
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
        authVersion: true, securityVersion: true, vaultProtection: true,
      },
    });

    // Always run argon2.verify regardless of whether the user exists.
    // This ensures constant response time and prevents user enumeration via timing.
    const hashToVerify = user?.passwordHash ?? DUMMY_HASH;
    const isValid = await argon2.verify(hashToVerify, dto.password);

    if (!user || !isValid || !user.isActive || user.authVersion !== (dto.authVersion ?? 1)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role, kdfSalt: user.kdfSalt,
      authVersion: user.authVersion, securityVersion: user.securityVersion, vaultProtection: user.vaultProtection };

    return {
      ...(await this.createSession(user)),
      user: safeUser,
    };
  }

  private async createSession(user: { id: string; email: string; role: string; securityVersion: number }) {
    const sessionId = randomUUID();
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.serializable(async (transaction) => {
      const current = await transaction.user.findFirst({ where: { id: user.id, securityVersion: user.securityVersion, isActive: true }, select: { id: true } });
      if (!current) throw new UnauthorizedException('A seguranca da conta mudou. Entre novamente.');
      await transaction.authSession.create({ data: { id: sessionId, userId: user.id, refreshHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000) } });
    });
    return { accessToken: this.jwt.sign({ sub: user.id, email: user.email, role: user.role, sid: sessionId }), refreshToken };
  }

  async parameters(email: string) {
    const user = await this.prisma.user.findFirst({ where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' }, isActive: true },
      select: { kdfSalt: true, authVersion: true, securityVersion: true, vaultProtection: true } });
    if (!user) {
      const secret = this.config.getOrThrow<string>('JWT_SECRET');
      return { kdfSalt: createHmac('sha256', secret).update(`parameters:${email.trim().toLowerCase()}`).digest('hex').slice(0, 32),
        authVersion: 2, recoverySalt: createHmac('sha256', secret).update(`recovery:${email.trim().toLowerCase()}`).digest('hex').slice(0, 32) };
    }
    const protection = user.vaultProtection as { recoverySalt?: string } | null;
    return { kdfSalt: user.kdfSalt, authVersion: user.authVersion,
      recoverySalt: protection?.recoverySalt };
  }

  async recoveryInfo(dto: RecoveryProofDto) {
    const user = await this.prisma.user.findFirst({ where: { email: { equals: dto.email.trim().toLowerCase(), mode: 'insensitive' }, isActive: true } });
    const valid = await argon2.verify(user?.recoveryHash ?? DUMMY_HASH, dto.recoveryCredential);
    if (!user || !valid || user.authVersion !== 2) throw new UnauthorizedException('Codigo de recuperacao ou conta invalidos.');
    return { protection: user.vaultProtection, securityVersion: user.securityVersion };
  }

  async updateSecurity(userId: string, dto: SecurityUpdateDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, dto.currentCredential))) throw new UnauthorizedException('Senha atual incorreta.');
    const previous = user.vaultProtection as unknown as SecurityUpdateDto['protection'] | null;
    if (!dto.recoveryCredential && (!previous || previous.recoverySalt !== dto.protection.recoverySalt ||
      previous.recoveryEnvelope.iv !== dto.protection.recoveryEnvelope.iv ||
      previous.recoveryEnvelope.ciphertext !== dto.protection.recoveryEnvelope.ciphertext)) {
      throw new BadRequestException('A nova protecao de recuperacao requer uma nova credencial.');
    }
    const passwordHash = await argon2.hash(dto.credential, ARGON2_OPTIONS);
    const recoveryHash = dto.recoveryCredential ? await argon2.hash(dto.recoveryCredential, ARGON2_OPTIONS) : user.recoveryHash;
    await this.prisma.serializable(async (transaction) => {
      const updated = await transaction.user.updateMany({ where: { id: userId, securityVersion: dto.securityVersion,
        passwordHash: user.passwordHash, isActive: true }, data: { passwordHash, recoveryHash, authVersion: 2,
        securityVersion: { increment: 1 }, kdfSalt: dto.protection.salt, vaultProtection: JSON.parse(JSON.stringify(dto.protection)) } });
      if (updated.count !== 1) throw new ConflictException('A seguranca mudou em outro aparelho. Entre novamente.');
      await transaction.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date(), fcmToken: null } });
    });
    return { securityVersion: dto.securityVersion + 1 };
  }

  async recover(dto: RecoverAccountDto) {
    await this.recoveryInfo(dto);
    const user = await this.prisma.user.findFirst({ where: { email: { equals: dto.email.trim().toLowerCase(), mode: 'insensitive' }, isActive: true } });
    if (!user || !user.recoveryHash || !(await argon2.verify(user.recoveryHash, dto.recoveryCredential))) throw new UnauthorizedException();
    const passwordHash = await argon2.hash(dto.credential, ARGON2_OPTIONS);
    const recoveryHash = await argon2.hash(dto.newRecoveryCredential, ARGON2_OPTIONS);
    await this.prisma.serializable(async (transaction) => {
      const result = await transaction.user.updateMany({ where: { id: user.id, securityVersion: dto.securityVersion,
        recoveryHash: user.recoveryHash, isActive: true }, data: { passwordHash, recoveryHash, authVersion: 2,
        securityVersion: { increment: 1 }, kdfSalt: dto.protection.salt, vaultProtection: JSON.parse(JSON.stringify(dto.protection)) } });
      if (result.count !== 1) throw new ConflictException('Codigo ja utilizado ou seguranca alterada.');
      await transaction.authSession.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date(), fcmToken: null } });
    });
    return { success: true };
  }

  async refresh(refreshToken: string, requestId?: string) {
    const hash = hashToken(refreshToken);
    return this.prisma.serializable(async (transaction) => {
      const current = await transaction.authSession.findUnique({ where: { refreshHash: hash }, include: { user: true } });
      const session = current ?? (requestId ? await transaction.authSession.findFirst({ where: {
        previousRefreshHash: hash, refreshRequestId: requestId, refreshRetryUntil: { gt: new Date() }, revokedAt: null,
      }, include: { user: true } }) : null);
      if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
        throw new UnauthorizedException('Sessao expirada. Entre novamente.');
      }
      const rotated = requestId ? createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
        .update(JSON.stringify(['SenhaFacil/refresh/v2', session.id, hash, requestId])).digest('base64url') : randomBytes(32).toString('base64url');
      if (!current) {
        if (hashToken(rotated) !== session.refreshHash) throw new UnauthorizedException('Renovacao indisponivel.');
        return { refreshToken: rotated, accessToken: this.jwt.sign({ sub: session.userId, email: session.user.email, role: session.user.role, sid: session.id }) };
      }
      const result = await transaction.authSession.updateMany({
        where: { id: session.id, refreshHash: hash, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { refreshHash: hashToken(rotated), ...(requestId ? { previousRefreshHash: hash, refreshRequestId: requestId,
          refreshRetryUntil: new Date(Date.now() + 60_000) } : { previousRefreshHash: null, refreshRequestId: null, refreshRetryUntil: null }) },
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
