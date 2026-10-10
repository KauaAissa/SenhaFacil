import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import type { InviteContactDto } from './dto/invite-contact.dto';
import type { UpdatePermissionsDto } from './dto/update-permissions.dto';

const CONTACT_SELECT = {
  id: true,
  status: true,
  permissions: true,
  createdAt: true,
  updatedAt: true,
  elderly: { select: { id: true, name: true, email: true } },
  caregiver: { select: { id: true, name: true, email: true } },
} as const;

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── POST /contacts/invite ──────────────────────────────────────────────────

  /**
   * Elderly user invites a caregiver by email.
   * The caregiver must already have an account (self-service invite acceptance
   * flow — no email delivery/registration link in this iteration).
   */
  async invite(elderlyId: string, dto: InviteContactDto) {
    return this.prisma.serializable(async (transaction) => {
    const caregiver = await transaction.user.findFirst({
      where: { email: { equals: dto.caregiverEmail.trim().toLowerCase(), mode: 'insensitive' } },
      select: { id: true, role: true, isActive: true },
    });

    if (!caregiver || !caregiver.isActive) {
      throw new NotFoundException('No account found with this email');
    }

    if (caregiver.id === elderlyId) {
      throw new BadRequestException('You cannot invite yourself');
    }

    if (caregiver.role !== 'CAREGIVER') {
      throw new BadRequestException('Invited user must have the CAREGIVER role');
    }

    const existing = await transaction.trustedContact.findUnique({
      where: { elderlyId_caregiverId: { elderlyId, caregiverId: caregiver.id } },
      select: { id: true, status: true },
    });

    if (existing && existing.status !== 'REVOKED') {
      throw new ConflictException(`A relationship with this caregiver already exists (${existing.status})`);
    }

    // Re-inviting after a REVOKED relation reuses the row instead of duplicating it
    const contact = existing
        ? await transaction.trustedContact.update({
          where: { id: existing.id, status: 'REVOKED' },
          data: { status: 'PENDING', permissions: ['VIEW_ITEMS'] },
          select: CONTACT_SELECT,
        })
      : await transaction.trustedContact.create({
          data: {
            elderlyId,
            caregiverId: caregiver.id,
            status: 'PENDING',
            permissions: ['VIEW_ITEMS'], // Conservative default — elderly grants more explicitly
          },
          select: CONTACT_SELECT,
        });

    return contact;
    }).catch(rejectChangedContact);
  }

  // ─── POST /contacts/:id/accept ──────────────────────────────────────────────

  /** Caregiver accepts a pending invite addressed to them. */
  async accept(caregiverId: string, contactId: string) {
    const contact = await this.prisma.trustedContact.findUnique({
      where: { id: contactId },
      select: { id: true, caregiverId: true, status: true },
    });

    if (!contact) throw new NotFoundException('Invite not found');
    if (contact.caregiverId !== caregiverId) {
      throw new ForbiddenException('This invite does not belong to you');
    }
    if (contact.status !== 'PENDING') {
      throw new BadRequestException(`Cannot accept: invite is already ${contact.status}`);
    }

    return this.prisma.trustedContact.update({
      where: { id: contactId, caregiverId, status: 'PENDING' },
      data: { status: 'ACTIVE' },
      select: CONTACT_SELECT,
    }).catch(rejectChangedContact);
  }

  // ─── POST /contacts/:id/revoke ──────────────────────────────────────────────

  /**
   * Revokes a relationship. Either party may revoke:
   *   - Elderly: removes a caregiver's access entirely
   *   - Caregiver: steps down from a relationship ("leave")
   */
  async revoke(userId: string, contactId: string) {
    const contact = await this.prisma.trustedContact.findUnique({
      where: { id: contactId },
      select: { id: true, elderlyId: true, caregiverId: true, status: true },
    });

    if (!contact) throw new NotFoundException('Relationship not found');

    const isParty = contact.elderlyId === userId || contact.caregiverId === userId;
    if (!isParty) throw new ForbiddenException('You are not part of this relationship');

    if (contact.status === 'REVOKED') {
      throw new BadRequestException('Relationship is already revoked');
    }

    return this.prisma.trustedContact.update({
      where: { id: contactId, status: contact.status, OR: [{ elderlyId: userId }, { caregiverId: userId }] },
      data: { status: 'REVOKED' },
      select: CONTACT_SELECT,
    }).catch(rejectChangedContact);
  }

  // ─── PATCH /contacts/:id/permissions ────────────────────────────────────────

  /** Only the elderly user (owner of the vault) can grant/revoke permissions. */
  async updatePermissions(elderlyId: string, contactId: string, dto: UpdatePermissionsDto) {
    if (dto.permissions.includes('MANAGE_ITEMS' as never)) {
      throw new BadRequestException('Familiares nao podem criar ou editar senhas do cofre.');
    }
    const contact = await this.prisma.trustedContact.findFirst({
      where: { id: contactId, elderlyId },
      select: { id: true, status: true },
    });

    if (!contact) throw new NotFoundException('Relationship not found');

    if (contact.status !== 'ACTIVE') {
      throw new BadRequestException('Permissions can only be changed for an active relationship');
    }

    return this.prisma.trustedContact.update({
      where: { id: contactId, elderlyId, status: 'ACTIVE' },
      data: { permissions: dto.permissions },
      select: CONTACT_SELECT,
    }).catch(rejectChangedContact);
  }

  // ─── GET /contacts ──────────────────────────────────────────────────────────

  /**
   * Lists relationships for the authenticated user.
   * Result shape depends on role: an ELDERLY user sees their caregivers,
   * a CAREGIVER sees the elderly users they assist.
   */
  async findAll(userId: string, role: string) {
    return this.prisma.trustedContact.findMany({
      where: role === 'CAREGIVER' ? { caregiverId: userId } : { elderlyId: userId },
      select: CONTACT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }
}

function rejectChangedContact(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2025'].includes(error.code)) {
    throw new ConflictException('O vinculo mudou. Atualize a lista.');
  }
  throw error;
}
