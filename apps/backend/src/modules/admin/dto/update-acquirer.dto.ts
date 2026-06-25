import { PartialType } from '@nestjs/swagger';
import { CreateAcquirerDto } from './create-acquirer.dto';

export class UpdateAcquirerDto extends PartialType(CreateAcquirerDto) {}
