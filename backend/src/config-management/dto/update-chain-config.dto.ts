import { PartialType } from '@nestjs/swagger';
import { CreateChainConfigDto } from './create-chain-config.dto';

export class UpdateChainConfigDto extends PartialType(CreateChainConfigDto) {}
