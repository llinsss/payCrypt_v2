import { IsString, IsNumber, IsOptional, Matches, Min, Max, Length } from 'class-validator';

export class CreateAccountDto {
    @IsString()
    @Length(3, 30, { message: 'Tag must be between 3 and 30 characters' })
    @Matches(/^[a-zA-Z0-9_]+$/, {
        message: 'Tag can only contain letters, numbers, and underscores',
    })
    tag: string;

    @IsOptional()
    @IsNumber()
    @Min(0, { message: 'Initial balance cannot be negative' })
    @Max(10000, { message: 'Initial balance cannot exceed 10000' })
    initialBalance?: number = 10;
}
