import { Controller, Get, Post, Param, UseGuards, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @ApiOperation({ summary: 'List payments' })
  async findAll(@Param('workspaceId') workspaceId: string) {
    return this.paymentsService.findAll(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get payment details' })
  async findOne(@Param('id') id: string) {
    return this.paymentsService.findById(id);
  }

  @Post('initiate')
  @ApiOperation({ summary: 'Initiate a PIX payment' })
  async initiatePayment(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.paymentsService.initiatePayment(workspaceId, dto);
  }
}
