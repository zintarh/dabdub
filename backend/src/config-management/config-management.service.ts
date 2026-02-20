import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlockchainConfig } from './entities/blockchain-config.entity';
import { TokenConfig } from './entities/token-config.entity';
import { CreateChainConfigDto } from './dto/create-chain-config.dto';
import { UpdateChainConfigDto } from './dto/update-chain-config.dto';
import { CreateTokenConfigDto } from './dto/create-token-config.dto';
import { UpdateTokenConfigDto } from './dto/update-token-config.dto';
import { RedisService } from '../common/redis';
import { RedisKeys } from '../common/redis';

@Injectable()
export class ConfigManagementService {
  constructor(
    @InjectRepository(BlockchainConfig)
    private readonly blockchainConfigRepo: Repository<BlockchainConfig>,
    @InjectRepository(TokenConfig)
    private readonly tokenConfigRepo: Repository<TokenConfig>,
    private readonly redis: RedisService,
  ) {}

  async createChainConfig(dto: CreateChainConfigDto): Promise<BlockchainConfig> {
    const existing = await this.blockchainConfigRepo.findOne({
      where: { chainId: dto.chainId },
    });

    if (existing) {
      throw new ConflictException(`Chain with ID ${dto.chainId} already exists`);
    }

    const config = this.blockchainConfigRepo.create({
      chainId: dto.chainId,
      displayName: dto.displayName,
      rpcUrl: dto.rpcUrl,
      fallbackRpcUrl: dto.fallbackRpcUrl || null,
      explorerUrl: dto.explorerUrl,
      requiredConfirmations: dto.requiredConfirmations ?? 12,
      isEnabled: dto.isEnabled ?? true,
      status: dto.status ?? 'online',
      nativeCurrencySymbol: dto.nativeCurrencySymbol,
      nativeCurrencyDecimals: dto.nativeCurrencyDecimals ?? 18,
      priority: dto.priority ?? 0,
    });

    const saved = await this.blockchainConfigRepo.save(config);
    await this.invalidateChainCache();
    return saved;
  }

  async findAllChains(enabledOnly = false): Promise<BlockchainConfig[]> {
    const cacheKey = RedisKeys.configChains(enabledOnly);
    const cached = await this.redis.get<BlockchainConfig[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const query = this.blockchainConfigRepo
      .createQueryBuilder('chain')
      .leftJoinAndSelect('chain.tokens', 'tokens')
      .orderBy('chain.priority', 'DESC')
      .addOrderBy('chain.displayName', 'ASC');

    if (enabledOnly) {
      query.where('chain.isEnabled = :enabled', { enabled: true });
    }

    const chains = await query.getMany();
    await this.redis.set(cacheKey, chains, 300);
    return chains;
  }

  async findChainById(chainId: string): Promise<BlockchainConfig> {
    const chain = await this.blockchainConfigRepo.findOne({
      where: { chainId },
      relations: ['tokens'],
    });

    if (!chain) {
      throw new NotFoundException(`Chain with ID ${chainId} not found`);
    }

    return chain;
  }

  async updateChainConfig(
    chainId: string,
    dto: UpdateChainConfigDto,
  ): Promise<BlockchainConfig> {
    const chain = await this.findChainById(chainId);

    if (dto.chainId && dto.chainId !== chainId) {
      const existing = await this.blockchainConfigRepo.findOne({
        where: { chainId: dto.chainId },
      });
      if (existing) {
        throw new ConflictException(`Chain with ID ${dto.chainId} already exists`);
      }
    }

    Object.assign(chain, dto);
    const updated = await this.blockchainConfigRepo.save(chain);
    await this.invalidateChainCache();
    return updated;
  }

  async deleteChainConfig(chainId: string): Promise<void> {
    const chain = await this.findChainById(chainId);
    await this.blockchainConfigRepo.remove(chain);
    await this.invalidateChainCache();
  }

  async createTokenConfig(dto: CreateTokenConfigDto): Promise<TokenConfig> {
    const chain = await this.findChainById(dto.chainId);

    const existing = await this.tokenConfigRepo.findOne({
      where: {
        chainId: dto.chainId,
        tokenAddress: dto.tokenAddress.toLowerCase(),
      },
    });

    if (existing) {
      throw new ConflictException(
        `Token ${dto.tokenAddress} already exists on chain ${dto.chainId}`,
      );
    }

    const token = this.tokenConfigRepo.create({
      chainId: dto.chainId,
      blockchainConfig: chain,
      tokenAddress: dto.tokenAddress.toLowerCase(),
      symbol: dto.symbol,
      name: dto.name,
      decimals: dto.decimals,
      logoUrl: dto.logoUrl || null,
      isEnabled: dto.isEnabled ?? true,
      isStablecoin: dto.isStablecoin ?? false,
      priority: dto.priority ?? 0,
    });

    const saved = await this.tokenConfigRepo.save(token);
    await this.invalidateChainCache();
    return saved;
  }

  async findAllTokens(chainId?: string, enabledOnly = false): Promise<TokenConfig[]> {
    const query = this.tokenConfigRepo
      .createQueryBuilder('token')
      .leftJoinAndSelect('token.blockchainConfig', 'chain')
      .orderBy('token.priority', 'DESC')
      .addOrderBy('token.symbol', 'ASC');

    if (chainId) {
      query.where('token.chainId = :chainId', { chainId });
    }

    if (enabledOnly) {
      query.andWhere('token.isEnabled = :enabled', { enabled: true });
    }

    return query.getMany();
  }

  async findTokenById(id: string): Promise<TokenConfig> {
    const token = await this.tokenConfigRepo.findOne({
      where: { id },
      relations: ['blockchainConfig'],
    });

    if (!token) {
      throw new NotFoundException(`Token with ID ${id} not found`);
    }

    return token;
  }

  async findTokenByAddress(
    chainId: string,
    tokenAddress: string,
  ): Promise<TokenConfig> {
    const token = await this.tokenConfigRepo.findOne({
      where: {
        chainId,
        tokenAddress: tokenAddress.toLowerCase(),
      },
      relations: ['blockchainConfig'],
    });

    if (!token) {
      throw new NotFoundException(
        `Token ${tokenAddress} not found on chain ${chainId}`,
      );
    }

    return token;
  }

  async updateTokenConfig(
    id: string,
    dto: UpdateTokenConfigDto,
  ): Promise<TokenConfig> {
    const token = await this.findTokenById(id);

    if (dto.tokenAddress && dto.tokenAddress.toLowerCase() !== token.tokenAddress) {
      const existing = await this.tokenConfigRepo.findOne({
        where: {
          chainId: token.chainId,
          tokenAddress: dto.tokenAddress.toLowerCase(),
        },
      });
      if (existing) {
        throw new ConflictException(
          `Token ${dto.tokenAddress} already exists on chain ${token.chainId}`,
        );
      }
    }

    if (dto.chainId && dto.chainId !== token.chainId) {
      const chain = await this.findChainById(dto.chainId);
      token.blockchainConfig = chain;
    }

    Object.assign(token, {
      ...dto,
      tokenAddress: dto.tokenAddress
        ? dto.tokenAddress.toLowerCase()
        : token.tokenAddress,
    });

    const updated = await this.tokenConfigRepo.save(token);
    await this.invalidateChainCache();
    return updated;
  }

  async deleteTokenConfig(id: string): Promise<void> {
    const token = await this.findTokenById(id);
    await this.tokenConfigRepo.remove(token);
    await this.invalidateChainCache();
  }

  private async invalidateChainCache(): Promise<void> {
    await Promise.all([
      this.redis.del(RedisKeys.configChains(true)),
      this.redis.del(RedisKeys.configChains(false)),
    ]);
  }
}
