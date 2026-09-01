import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class RegisterTagDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^@?[a-z0-9_]{3,30}$/, {
    message: 'Tag must be 3-30 characters, alphanumeric and underscores only',
  })
  tag: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'Invalid Stellar public key format',
  })
  publicKey: string;
}
