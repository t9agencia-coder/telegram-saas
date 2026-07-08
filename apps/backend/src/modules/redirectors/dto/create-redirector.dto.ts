import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsObject,
  ValidateNested,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RedirectorSourcesDto {
  @IsOptional()
  @IsBoolean()
  facebook?: boolean;

  @IsOptional()
  @IsBoolean()
  tiktok?: boolean;

  @IsOptional()
  @IsBoolean()
  kwai?: boolean;

  @IsOptional()
  @IsBoolean()
  google?: boolean;
}

export class RedirectorScheduleDto {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  start: string;

  @IsString()
  end: string;
}

export class RedirectorRulesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => RedirectorSourcesDto)
  sources?: RedirectorSourcesDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  devices?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  os?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  countries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => RedirectorScheduleDto)
  schedule?: RedirectorScheduleDto;

  @IsOptional()
  @IsString()
  deviceFilter?: string; // 'all' | 'mobile_only'
}

export class CreateRedirectorDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  flowId?: string;

  @IsOptional()
  @IsString()
  domainId?: string;

  @IsString()
  alternativeUrl: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RedirectorRulesDto)
  rules?: RedirectorRulesDto;
}

export class UpdateRedirectorDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  flowId?: string;

  @IsOptional()
  @IsString()
  domainId?: string;

  @IsOptional()
  @IsString()
  alternativeUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RedirectorRulesDto)
  rules?: RedirectorRulesDto;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ResolveRedirectorDto {
  @IsString()
  ua: string;

  @IsString()
  acceptLanguage: string;

  @IsOptional()
  @IsString()
  ip?: string;

  // --- Parâmetros de clique ---
  @IsOptional()
  @IsString()
  fbclid?: string;

  @IsOptional()
  @IsString()
  ttclid?: string;

  @IsOptional()
  @IsString()
  kwaiId?: string;

  // --- UTM ---
  @IsOptional()
  @IsString()
  utmSource?: string;

  @IsOptional()
  @IsString()
  utmMedium?: string;

  @IsOptional()
  @IsString()
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  utmContent?: string;

  @IsOptional()
  @IsString()
  utmTerm?: string;

  // --- Cookies de pixel ---
  @IsOptional()
  @IsString()
  fbp?: string;

  @IsOptional()
  @IsString()
  fbc?: string;

  @IsOptional()
  @IsString()
  ttp?: string;

  @IsOptional()
  @IsString()
  kwaiPixel?: string;
}
