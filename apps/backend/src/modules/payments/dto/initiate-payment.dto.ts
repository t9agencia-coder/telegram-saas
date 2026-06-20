import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitiatePaymentDto {
  @ApiProperty()
  @IsString()
  leadId: string;

  @ApiProperty()
  @IsString()
  productId: string;
}
