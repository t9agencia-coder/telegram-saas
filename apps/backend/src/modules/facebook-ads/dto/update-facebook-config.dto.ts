import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateFacebookConfigDto {
  @IsOptional()
  @IsString()
  pixelId?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  eventPageView?: boolean;

  @IsOptional()
  @IsBoolean()
  eventAddToCart?: boolean;

  @IsOptional()
  @IsBoolean()
  eventPurchase?: boolean;
}

export class TestFacebookConnectionDto {
  @IsOptional()
  @IsString()
  pixelId?: string;

  @IsOptional()
  @IsString()
  accessToken?: string;
}
