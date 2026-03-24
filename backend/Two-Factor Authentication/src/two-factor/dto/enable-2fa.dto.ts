import { IsNotEmpty, IsString } from "class-validator";

export class Enable2FADto {
  @IsNotEmpty()
  @IsString()
  password: string;
}

export class Verify2FADto {
  @IsNotEmpty()
  @IsString()
  token: string;
}

export class Disable2FADto {
  @IsNotEmpty()
  @IsString()
  password: string;

  @IsNotEmpty()
  @IsString()
  token: string;
}
