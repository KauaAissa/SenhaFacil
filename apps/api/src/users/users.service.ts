import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, surname: true, dateOfBirth: true, email: true, phone: true, role: true, createdAt: true },
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    if (dto.name !== undefined && !dto.name.trim()) throw new BadRequestException('Informe seu nome.');
    const birth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
    if (birth && (birth > new Date() || birth.getUTCFullYear() < 1900)) throw new BadRequestException('Data de nascimento invalida.');
    try {
      await this.prisma.user.update({ where: { id: userId }, data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.surname !== undefined && { surname: dto.surname.trim() }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.dateOfBirth !== undefined && { dateOfBirth: birth }),
      } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Telefone ja cadastrado.');
      throw error;
    }
    return this.getProfile(userId);
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) throw new UnauthorizedException('Senha incorreta.');
    await this.prisma.user.delete({ where: { id: userId } });
  }

  /** Updates the FCM push token — called on app start and after Firebase token refresh. */
  async updateFcmToken(userId: string, sessionId: string, fcmToken: string | null) {
    await this.prisma.serializable(async (transaction) => {
      if (fcmToken) await transaction.authSession.updateMany({ where: { fcmToken, id: { not: sessionId } }, data: { fcmToken: null } });
      const result = await transaction.authSession.updateMany({ where: { id: sessionId, userId, revokedAt: null,
        expiresAt: { gt: new Date() } }, data: { fcmToken } });
      if (result.count !== 1) throw new UnauthorizedException('Sessao encerrada.');
    });
    return { success: true };
  }
}
