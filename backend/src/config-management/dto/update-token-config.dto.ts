import { PartialType } from '@nestjs/swagger';
import { CreateTokenConfigDto } from './create-token-config.dto';

export class UpdateTokenConfigDto extends PartialType(CreateTokenConfigDto) {}
