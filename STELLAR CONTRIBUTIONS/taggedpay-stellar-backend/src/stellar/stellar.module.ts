import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StellarService } from './stellar.service';

@Global()
@Module({
    // CHANGE: Added ConfigModule.forFeature to ensure configuration is available
    imports: [ConfigModule],
    providers: [StellarService],
    exports: [StellarService],
})
export class StellarModule { }
