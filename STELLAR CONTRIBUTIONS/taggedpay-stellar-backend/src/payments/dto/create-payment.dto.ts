import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';

export class CreatePaymentDto {
    @IsString()
    @IsNotEmpty()
    fromTag: string;

    @IsString()
    @IsNotEmpty()
    toTag: string;

    @IsNumber()
    @Min(0.0000001)
    amount: number;
}
