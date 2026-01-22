import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StellarModule } from './stellar/stellar.module';
import { AccountsModule } from './accounts/accounts.module';

@Module({
  imports: [StellarModule, AccountsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
