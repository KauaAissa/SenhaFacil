import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';

export enum VaultPermissionDto {
  VIEW_ITEMS = 'VIEW_ITEMS',
  APPROVE_ACCESS = 'APPROVE_ACCESS',
  MANAGE_ITEMS = 'MANAGE_ITEMS',
}

export class UpdatePermissionsDto {
  /** Full replacement of the permission set granted to this caregiver. */
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(VaultPermissionDto, { each: true })
  permissions: VaultPermissionDto[];
}
