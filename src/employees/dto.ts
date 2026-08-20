import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { ALL_PERMISSIONS } from '../common/defaults';

export class CreateEmployeeDto {
  @IsString({ message: 'Ism kiritilishi shart' })
  @MinLength(1, { message: 'Ism kiritilishi shart' })
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString({ message: 'Telefon raqami kiritilishi shart' })
  @Matches(/^\+998\d{9}$/, { message: 'Telefon raqami noto\'g\'ri' })
  phone: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Login kiritilishi shart' })
  @MinLength(3, { message: 'Login kamida 3 belgidan iborat bo\'lishi kerak' })
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: 'Login faqat harf, raqam, nuqta, tire yoki pastki chiziqdan iborat bo\'lishi kerak' })
  username: string;

  @IsString()
  @MinLength(6, { message: 'Parol kamida 6 belgidan iborat bo\'lishi kerak' })
  password: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsIn(['ALL', 'ASSIGNED', 'GROUPS'])
  customerVisibility?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedGroupIds?: string[];

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  permissions?: string[];

  @IsOptional()
  @IsString()
  teamId?: string;

  @IsOptional()
  @IsString()
  partnerGroupId?: string;
}

export class UpdateEmployeePermissionsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions: string[];
}
