import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TelegramBotsService } from './telegram-bots.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceOwnerGuard } from '../../common/guards/workspace-owner.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

@ApiTags('Telegram Bots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, WorkspaceOwnerGuard)
@Controller('workspaces/:workspaceId/bots')
export class TelegramBotsController {
  constructor(private readonly botsService: TelegramBotsService) {}

  @Get()
  @ApiOperation({ summary: 'List all bots in workspace' })
  async findAll(@Param('workspaceId') workspaceId: string) {
    return this.botsService.findAll(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get bot by ID' })
  async findOne(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.botsService.findById(workspaceId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Register a new Telegram bot' })
  async create(@Param('workspaceId') workspaceId: string, @Body() dto: CreateBotDto) {
    return this.botsService.create(workspaceId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update bot settings' })
  async update(@Param('workspaceId') workspaceId: string, @Param('id') id: string, @Body() dto: UpdateBotDto) {
    return this.botsService.update(workspaceId, id, dto);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test bot connection' })
  async testConnection(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.botsService.testConnection(workspaceId, id);
  }

  @Post(':id/reregister-webhook')
  @ApiOperation({ summary: 'Re-register Telegram webhook with current URL' })
  async reregisterWebhook(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.botsService.reregisterWebhook(workspaceId, id);
  }

  @Get(':id/webhook-info')
  @ApiOperation({ summary: 'Get current webhook info from Telegram' })
  async getWebhookInfo(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.botsService.getWebhookInfo(workspaceId, id);
  }

  @Get(':id/warmup-qr')
  @ApiOperation({ summary: 'QR code do deep link pra registrar o chat de aquecimento de mídia' })
  async getWarmupQr(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.botsService.getWarmupQr(workspaceId, id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete bot' })
  async remove(@Param('workspaceId') workspaceId: string, @Param('id') id: string) {
    return this.botsService.remove(workspaceId, id);
  }
}
