import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContactsService } from './contacts.service';
import { InviteContactDto } from './dto/invite-contact.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

interface AuthRequest {
  user: { id: string; role: string };
}

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  /**
   * POST /contacts/invite
   * Elderly user invites an existing CAREGIVER account by email.
   * Creates a TrustedContact in PENDING status.
   */
  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(@Req() req: AuthRequest, @Body() dto: InviteContactDto) {
    return this.contactsService.invite(req.user.id, dto);
  }

  /**
   * POST /contacts/:id/accept
   * Caregiver accepts a pending invite. PENDING → ACTIVE.
   */
  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.contactsService.accept(req.user.id, id);
  }

  /**
   * POST /contacts/:id/revoke
   * Either party may revoke the relationship. → REVOKED.
   */
  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.contactsService.revoke(req.user.id, id);
  }

  /**
   * PATCH /contacts/:id/permissions
   * Elderly user grants/revokes granular permissions for an active caregiver.
   */
  @Patch(':id/permissions')
  updatePermissions(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    return this.contactsService.updatePermissions(req.user.id, id, dto);
  }

  /**
   * GET /contacts
   * Lists relationships for the authenticated user (role-dependent view).
   */
  @Get()
  findAll(@Req() req: AuthRequest) {
    return this.contactsService.findAll(req.user.id, req.user.role);
  }
}
