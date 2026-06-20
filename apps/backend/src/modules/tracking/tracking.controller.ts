import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { TrackEventDto } from './dto/track-event.dto';

@ApiTags('Tracking')
@Controller('tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post()
  @ApiOperation({ summary: 'Track an event with UTM data' })
  async track(@Body() dto: TrackEventDto) {
    return this.trackingService.track(dto);
  }
}
