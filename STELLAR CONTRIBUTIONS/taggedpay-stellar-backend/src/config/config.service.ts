import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: NestConfigService) {}

  get environment(): string {
    return this.configService.get<string>('environment');
  }

  get isDevelopment(): boolean {
    return this.environment === 'development';
  }

  get isProduction(): boolean {
    return this.environment === 'production';
  }

  get isStaging(): boolean {
    return this.environment === 'staging';
  }

  get port(): number {
    return this.configService.get<number>('port');
  }

  // Stellar Configuration
  get stellarNetwork(): string {
    return this.configService.get<string>('stellar.network');
  }

  get stellarHorizonUrl(): string {
    return this.configService.get<string>('stellar.horizonUrl');
  }

  get stellarNetworkPassphrase(): string {
    return this.configService.get<string>('stellar.networkPassphrase');
  }

  get isTestnet(): boolean {
    return this.stellarNetwork === 'testnet';
  }

  // Database Configuration
  get databaseUrl(): string {
    return this.configService.get<string>('database.url');
  }

  get databaseConfig() {
    return {
      host: this.configService.get<string>('database.host'),
      port: this.configService.get<number>('database.port'),
      username: this.configService.get<string>('database.username'),
      password: this.configService.get<string>('database.password'),
      database: this.configService.get<string>('database.database'),
      synchronize: this.configService.get<boolean>('database.synchronize'),
      logging: this.configService.get<boolean>('database.logging'),
    };
  }

  // Redis Configuration
  get redisUrl(): string {
    return this.configService.get<string>('redis.url');
  }

  get redisConfig() {
    return {
      host: this.configService.get<string>('redis.host'),
      port: this.configService.get<number>('redis.port'),
      password: this.configService.get<string>('redis.password'),
    };
  }

  // JWT Configuration
  get jwtSecret(): string {
    return this.configService.get<string>('jwt.secret');
  }

  get jwtExpiresIn(): string {
    return this.configService.get<string>('jwt.expiresIn');
  }
}