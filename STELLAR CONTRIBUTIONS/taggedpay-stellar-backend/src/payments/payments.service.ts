import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { StellarService } from '../stellar/stellar.service';
import { AccountsService } from '../accounts/accounts.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly stellarService: StellarService,
        private readonly accountsService: AccountsService,
    ) { }

    /**
     * Sends payment from one tag to another
     * @param createPaymentDto Payment details
     * @returns Transaction result
     */
    async sendPayment(createPaymentDto: CreatePaymentDto) {
        const { fromTag, toTag, amount } = createPaymentDto;

        const senderAccount = this.accountsService.getAccountByTag(fromTag);
        if (!senderAccount) {
            throw new NotFoundException(`Sender tag @${fromTag} not found`);
        }

        const receiverAccount = this.accountsService.getAccountByTag(toTag);
        if (!receiverAccount) {
            throw new NotFoundException(`Receiver tag @${toTag} not found`);
        }

        if (senderAccount.tag === receiverAccount.tag) {
            throw new BadRequestException('Cannot send payment to self');
        }

        this.logger.log(`Processing payment: @${fromTag} -> @${toTag} (${amount} XLM)`);

        try {
            const txHash = await this.stellarService.sendPayment(
                senderAccount.secretKey,
                receiverAccount.publicKey,
                amount.toString(),
            );

            return {
                success: true,
                hash: txHash,
                from: `@${senderAccount.tag}`,
                to: `@${receiverAccount.tag}`,
                amount: amount,
            };
        } catch (error) {
            this.logger.error(`Payment failed between tags: ${error.message}`);
            throw new BadRequestException(`Payment failed: ${error.message}`);
        }
    }
}
