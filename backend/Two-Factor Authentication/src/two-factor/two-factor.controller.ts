import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { TwoFactorService } from "./two-factor.service";
import {
  Enable2FADto,
  Verify2FADto,
  Disable2FADto,
} from "./dto/enable-2fa.dto";

@Controller("auth/2fa")
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  @Post("enable")
  async enable2FA(@Request() req, @Body() dto: Enable2FADto) {
    const { qrCode, secret } = await this.twoFactorService.generateSecret(
      req.user.id,
      req.user.email,
    );

    return {
      message: "Scan QR code with authenticator app",
      qrCode,
      secret,
    };
  }

  @Post("verify")
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  async verify2FA(@Request() req, @Body() dto: Verify2FADto) {
    const result = await this.twoFactorService.enable2FA(
      req.user.id,
      req.body.password,
      dto.token,
    );

    return {
      message: "2FA enabled successfully",
      backupCodes: result.backupCodes,
    };
  }

  @Post("disable")
  @HttpCode(200)
  async disable2FA(@Request() req, @Body() dto: Disable2FADto) {
    return this.twoFactorService.disable2FA(
      req.user.id,
      dto.password,
      dto.token,
    );
  }

  @Get("backup-codes")
  async regenerateBackupCodes(
    @Request() req,
    @Body("password") password: string,
  ) {
    return this.twoFactorService.regenerateBackupCodes(req.user.id, password);
  }
}
