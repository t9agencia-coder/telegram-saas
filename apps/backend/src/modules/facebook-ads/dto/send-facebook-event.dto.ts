import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class SendFacebookEventDto {
  @IsString()
  eventName: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  ip?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;

  @IsString()
  @IsOptional()
  fbclid?: string;

  @IsString()
  @IsOptional()
  externalId?: string;

  @IsNumber()
  @IsOptional()
  value?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsArray()
  @IsOptional()
  contentIds?: string[];

  @IsString()
  @IsOptional()
  contentType?: string;
}
