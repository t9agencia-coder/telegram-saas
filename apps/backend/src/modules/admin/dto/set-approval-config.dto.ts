import { IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetApprovalConfigDto {
  @ApiProperty({ description: 'Ativa o Controle de Aprovação percentual pra este workspace' })
  @IsBoolean()
  approvalControlEnabled: boolean;

  @ApiProperty({ description: 'Percentual de vendas aprovadas automaticamente (0-100)', minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  approvalPercentage: number;
}
