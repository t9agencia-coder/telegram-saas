import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Query, UseGuards, ParseIntPipe, DefaultValuePipe, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { AdminService, WithdrawDto } from './admin.service';
import { CreateAcquirerDto } from './dto/create-acquirer.dto';
import { UpdateAcquirerDto } from './dto/update-acquirer.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── Dashboard ───────────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Platform KPIs' })
  getStats() {
    return this.adminService.getStats();
  }

  @Get('metrics')
  @ApiOperation({ summary: 'System health metrics (on-demand, read-only)' })
  getMetrics() {
    return this.adminService.getMetrics();
  }

  @Delete('queues/:name/failed')
  @HttpCode(200)
  @ApiOperation({ summary: 'Remove todos os jobs com falha de uma fila' })
  clearQueueFailed(@Param('name') name: string) {
    return this.adminService.clearQueueFailed(name);
  }

  @Get('dashboard/overview')
  @ApiOperation({ summary: 'Agregado global de receita, leads e conversão' })
  getDashboardOverview(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.adminService.getDashboardOverview(startDate, endDate);
  }

  @Get('dashboard/sales')
  @ApiOperation({ summary: 'Vendas por dia (todas as contas)' })
  getDashboardSales(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.adminService.getDashboardSales(startDate, endDate);
  }

  @Get('dashboard/leads')
  @ApiOperation({ summary: 'Leads por dia (todas as contas)' })
  getDashboardLeads(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.adminService.getDashboardLeads(startDate, endDate);
  }

  @Get('dashboard/transactions')
  @ApiOperation({ summary: 'Transações recentes de todas as contas' })
  getDashboardTransactions(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.adminService.getDashboardTransactions(startDate, endDate);
  }

  @Get('dashboard/activity')
  @ApiOperation({ summary: 'Atividades recentes de todas as contas' })
  getDashboardActivity(@Query('startDate') startDate?: string, @Query('endDate') endDate?: string) {
    return this.adminService.getDashboardActivity(startDate, endDate);
  }

  // ── Users ───────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List all users' })
  listUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.listUsers(page, limit);
  }

  @Patch('users/:id/toggle-active')
  @ApiOperation({ summary: 'Toggle user active status' })
  toggleUserActive(@Param('id') id: string) {
    return this.adminService.toggleUserActive(id);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Set user role' })
  setUserRole(@Param('id') id: string, @Body('role') role: 'USER' | 'ADMIN') {
    return this.adminService.setUserRole(id, role);
  }

  // ── Bots ────────────────────────────────────────────────────────────────────

  @Get('bots')
  @ApiOperation({ summary: 'List all bots' })
  listBots(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.adminService.listBots(page, limit, status);
  }

  @Patch('bots/:id/status')
  @ApiOperation({ summary: 'Set bot status (approve/block)' })
  setBotStatus(
    @Param('id') id: string,
    @Body('status') status: 'ACTIVE' | 'PENDING_REVIEW' | 'BLOCKED',
  ) {
    return this.adminService.setBotStatus(id, status);
  }

  // ── Acquirers ───────────────────────────────────────────────────────────────

  @Get('acquirers')
  @ApiOperation({ summary: 'List acquirers (masked keys)' })
  listAcquirers() {
    return this.adminService.listAcquirers();
  }

  @Get('acquirers/:id')
  @ApiOperation({ summary: 'Get acquirer with decrypted keys' })
  getAcquirer(@Param('id') id: string) {
    return this.adminService.getAcquirer(id);
  }

  @Post('acquirers')
  @ApiOperation({ summary: 'Create acquirer' })
  createAcquirer(@Body() dto: CreateAcquirerDto) {
    return this.adminService.createAcquirer(dto);
  }

  @Patch('acquirers/:id')
  @ApiOperation({ summary: 'Update acquirer' })
  updateAcquirer(@Param('id') id: string, @Body() dto: UpdateAcquirerDto) {
    return this.adminService.updateAcquirer(id, dto);
  }

  @Delete('acquirers/:id')
  @ApiOperation({ summary: 'Delete acquirer' })
  deleteAcquirer(@Param('id') id: string) {
    return this.adminService.deleteAcquirer(id);
  }

  @Post('acquirers/reorder')
  @ApiOperation({ summary: 'Reorder acquirers by priority' })
  reorderAcquirers(@Body('ids') ids: string[]) {
    return this.adminService.reorderAcquirers(ids);
  }

  @Post('acquirers/:id/validate')
  @ApiOperation({ summary: 'Validate acquirer credentials against the real API' })
  validateCredentials(@Param('id') id: string) {
    return this.adminService.validateAcquirerCredentials(id);
  }

  @Post('acquirers/:id/test-pix')
  @ApiOperation({ summary: 'Generate R$10 test PIX charge' })
  testPix(@Param('id') id: string) {
    return this.adminService.testAcquirerPix(id);
  }

  // ── Podpay dedicado ──────────────────────────────────────────────────────────

  @Get('podpay')
  @ApiOperation({ summary: 'Status da integração Podpay' })
  getPodpayStatus() {
    return this.adminService.getPodpayStatus();
  }

  @Post('podpay/setup')
  @HttpCode(200)
  @ApiOperation({ summary: 'Configura Podpay (cria ou atualiza a API Key)' })
  setupPodpay(
    @Body('apiKey') apiKey: string,
    @Body('environment') environment?: string,
  ) {
    return this.adminService.setupPodpay(apiKey, environment);
  }

  @Get('podpay/balance')
  @ApiOperation({ summary: 'Saldo disponível na conta Podpay' })
  getPodpayBalance() {
    return this.adminService.getPodpayBalance();
  }

  @Get('podpay/transactions')
  @ApiOperation({ summary: 'Transações recentes da Podpay' })
  getPodpayTransactions(
    @Query('page',     new DefaultValuePipe(1),  ParseIntPipe) page:     number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.adminService.getPodpayTransactions(page, pageSize);
  }

  // ── Impersonation ──────────────────────────────────────────────────────────

  @Post('users/:id/impersonate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Gera token de impersonation válido por 24h' })
  generateImpersonationToken(@Param('id') id: string) {
    return this.adminService.generateImpersonationToken(id);
  }

  // ── Remarketing Master ──────────────────────────────────────────────────────

  @Get('remarketing/leads')
  @ApiOperation({ summary: 'Lista de leads para remarketing' })
  listRemarketingLeads(
    @Query('page',        new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit',       new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('search')      search?:      string,
    @Query('botId')       botId?:       string,
    @Query('workspaceId') workspaceId?: string,
    @Query('hasPurchase') hasPurchase?: string,
  ) {
    const hp = hasPurchase === 'true' ? true : hasPurchase === 'false' ? false : undefined;
    return this.adminService.listRemarketingLeads(page, limit, search, botId, workspaceId, hp);
  }

  @Get('remarketing/flows')
  @ApiOperation({ summary: 'Fluxos ativos com bot configurado' })
  listRemarketingFlows() {
    return this.adminService.listRemarketingFlows();
  }

  @Post('remarketing/broadcast')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dispara fluxo para leads selecionados' })
  dispatchBroadcast(
    @Body('flowId')  flowId:  string,
    @Body('leadIds') leadIds: string[],
  ) {
    return this.adminService.dispatchBroadcast(flowId, leadIds);
  }

  // ── Cash-out (BaassPago) ────────────────────────────────────────────────────

  @Get('cashout/balance')
  @ApiOperation({ summary: 'Saldo disponível para saque (BaassPago)' })
  getCashoutBalance() {
    return this.adminService.getCashoutBalance();
  }

  @Post('cashout/withdraw')
  @HttpCode(200)
  @ApiOperation({ summary: 'Solicita saque PIX (BaassPago)' })
  requestWithdraw(@Body() dto: WithdrawDto) {
    return this.adminService.requestWithdraw(dto);
  }
}
