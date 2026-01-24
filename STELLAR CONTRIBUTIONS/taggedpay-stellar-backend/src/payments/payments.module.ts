import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { StellarModule } from '../stellar/stellar.module';
import { AccountsModule } from '../accounts/accounts.module';

@Module({
    imports: [StellarModule, AccountsModule],
    controllers: [PaymentsController],
    providers: [PaymentsService],
})
export class PaymentsModule { }
