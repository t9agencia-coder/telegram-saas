import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateUtmifyConfigDto {
  @IsOptional()
  @IsString()
  apiToken?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  eventPixGerado?: boolean;

  @IsOptional()
  @IsBoolean()
  eventPixPago?: boolean;
}

export class TestUtmifyDto {
  @IsOptional()
  @IsString()
  apiToken?: string;
}
