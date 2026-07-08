import {
  Controller, Get, Post, Body, Param, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BalanceService } from './balance.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';

@ApiTags('Balance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/balance')
export class BalanceController {
  constructor(private readonly balanceService: BalanceService) {}

  @Get()
  @ApiOperation({ summary: 'Saldo disponível/recebido/sacado do workspace' })
  getBalance(@Param('workspaceId') workspaceId: string) {
    return this.balanceService.getWorkspaceBalance(workspaceId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Extrato financeiro do workspace' })
  listTransactions(
    @Param('workspaceId') workspaceId: string,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.balanceService.listTransactions(workspaceId, page, limit);
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'Histórico de solicitações de saque do workspace' })
  listWithdrawals(@Param('workspaceId') workspaceId: string) {
    return this.balanceService.listWorkspaceWithdrawals(workspaceId);
  }

  @Post('withdrawals')
  @ApiOperation({ summary: 'Solicita um saque' })
  requestWithdrawal(
    @Param('workspaceId') workspaceId: string,
    @Body('amount') amount: number,
    @Body('pixKeyType') pixKeyType: string,
    @Body('pixKey') pixKey: string,
  ) {
    return this.balanceService.requestWithdrawal(workspaceId, amount, pixKeyType, pixKey);
  }
}
