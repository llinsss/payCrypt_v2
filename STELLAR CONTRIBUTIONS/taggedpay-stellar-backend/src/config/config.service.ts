import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private configService: NestConfigService) {}

  get environment(): string {
    return this.configService.get<string>('environment', 'development');
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
    return this.configService.get<number>('port', 3000);
  }

  // Stellar Configuration
  get stellarNetwork(): string {
    return this.configService.get<string>('stellar.network', 'testnet');
  }

  get stellarHorizonUrl(): string {
    return this.configService.get<string>('stellar.horizonUrl', 'https://horizon-testnet.stellar.org');
  }

  get stellarNetworkPassphrase(): string {
    return this.configService.get<string>('stellar.networkPassphrase', 'Test SDF Network ; September 2015');
  }

  get isTestnet(): boolean {
    return this.stellarNetwork === 'testnet';
  }

  // Database Configuration
  get databaseUrl(): string {
    return this.configService.get<string>('database.url', '');
  }

  get databaseConfig() {
    return {
      host: this.configService.get<string>('database.host', 'localhost'),
      port: this.configService.get<number>('database.port', 5432),
      username: this.configService.get<string>('database.username', 'taggedpay'),
      password: this.configService.get<string>('database.password', ''),
      database: this.configService.get<string>('database.database', 'taggedpay_db'),
      synchronize: this.configService.get<boolean>('database.synchronize', false),
      logging: this.configService.get<boolean>('database.logging', false),
    };
  }

  // Redis Configuration
  get redisUrl(): string {
    return this.configService.get<string>('redis.url', '');
  }

  get redisConfig() {
    return {
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string>('redis.password', ''),
    };
  }

  // JWT Configuration
  get jwtSecret(): string {
    return this.configService.get<string>('jwt.secret', 'development-secret-change-in-production');
  }

  get jwtExpiresIn(): string {
    return this.configService.get<string>('jwt.expiresIn', '1d');
  }
}