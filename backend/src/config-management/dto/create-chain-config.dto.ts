import { IsString, IsUrl, IsInt, IsBoolean, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChainConfigDto {
  @ApiProperty({ description: 'Unique chain identifier (e.g., "ethereum", "polygon")' })
  @IsString()
  chainId!: string;

  @ApiProperty({ description: 'Human-readable display name' })
  @IsString()
  displayName!: string;

  @ApiProperty({ description: 'Primary RPC endpoint URL' })
  @IsUrl()
  rpcUrl!: string;

  @ApiPropertyOptional({ description: 'Fallback RPC endpoint URL' })
  @IsUrl()
  @IsOptional()
  fallbackRpcUrl?: string;

  @ApiProperty({ description: 'Block explorer URL' })
  @IsUrl()
  explorerUrl!: string;

  @ApiPropertyOptional({ description: 'Required block confirmations', default: 12 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  requiredConfirmations?: number;

  @ApiPropertyOptional({ description: 'Whether chain is enabled', default: true })
  @IsBoolean()
  @IsOptional()
  isEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Chain status', enum: ['online', 'degraded', 'offline'], default: 'online' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiProperty({ description: 'Native currency symbol (e.g., "ETH", "MATIC")' })
  @IsString()
  nativeCurrencySymbol!: string;

  @ApiPropertyOptional({ description: 'Native currency decimals', default: 18 })
  @IsInt()
  @Min(0)
  @Max(18)
  @IsOptional()
  nativeCurrencyDecimals?: number;

  @ApiPropertyOptional({ description: 'Display priority (higher = shown first)', default: 0 })
  @IsInt()
  @IsOptional()
  priority?: number;
}
