import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StellarModule } from './stellar/stellar.module';
import { AccountsModule } from './accounts/accounts.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [StellarModule, AccountsModule, PaymentsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
