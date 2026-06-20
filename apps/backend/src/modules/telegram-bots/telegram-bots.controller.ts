import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TelegramBotsService } from './telegram-bots.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

@ApiTags('Telegram Bots')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
  async findOne(@Param('id') id: string) {
    return this.botsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Register a new Telegram bot' })
  async create(@Param('workspaceId') workspaceId: string, @Body() dto: CreateBotDto) {
    return this.botsService.create(workspaceId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update bot settings' })
  async update(@Param('id') id: string, @Body() dto: UpdateBotDto) {
    return this.botsService.update(id, dto);
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test bot connection' })
  async testConnection(@Param('id') id: string) {
    return this.botsService.testConnection(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete bot' })
  async remove(@Param('id') id: string) {
    return this.botsService.remove(id);
  }
}
