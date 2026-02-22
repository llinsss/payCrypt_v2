import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as speakeasy from "speakeasy";
import * as qrcode from "qrcode";
import * as bcrypt from "bcrypt";
import { User } from "../entities/user.entity";

@Injectable()
export class TwoFactorService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async generateSecret(userId: string, email: string) {
    const secret = speakeasy.generateSecret({
      name: `Tagged (@${email})`,
      length: 32,
    });

    await this.userRepository.update(userId, {
      twoFactorSecret: secret.base32,
    });

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode: qrCodeUrl,
    };
  }

  async enable2FA(userId: string, password: string, token: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid password");
    }

    if (!user.twoFactorSecret) {
      throw new BadRequestException("2FA secret not generated");
    }

    const isValid = this.verifyToken(user.twoFactorSecret, token);
    if (!isValid) {
      throw new UnauthorizedException("Invalid TOTP code");
    }

    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, 10)),
    );

    await this.userRepository.update(userId, {
      twoFactorEnabled: true,
      twoFactorEnabledAt: new Date(),
      backupCodes: hashedBackupCodes,
    });

    return { backupCodes };
  }

  verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 2, // Allow 60s time drift
    });
  }

  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user || !user.backupCodes) {
      return false;
    }

    for (let i = 0; i < user.backupCodes.length; i++) {
      const isValid = await bcrypt.compare(code, user.backupCodes[i]);
      if (isValid) {
        // Remove used backup code
        const updatedCodes = [...user.backupCodes];
        updatedCodes.splice(i, 1);
        await this.userRepository.update(userId, { backupCodes: updatedCodes });
        return true;
      }
    }

    return false;
  }

  async disable2FA(userId: string, password: string, token: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid password");
    }

    if (!user.twoFactorEnabled) {
      throw new BadRequestException("2FA is not enabled");
    }

    const isValid = this.verifyToken(user.twoFactorSecret, token);
    if (!isValid) {
      throw new UnauthorizedException("Invalid TOTP code");
    }

    await this.userRepository.update(userId, {
      twoFactorEnabled: false,
      twoFactorSecret: null,
      backupCodes: null,
      twoFactorEnabledAt: null,
    });

    return { message: "2FA disabled successfully" };
  }

  async regenerateBackupCodes(userId: string, password: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid password");
    }

    if (!user.twoFactorEnabled) {
      throw new BadRequestException("2FA is not enabled");
    }

    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, 10)),
    );

    await this.userRepository.update(userId, {
      backupCodes: hashedBackupCodes,
    });

    return { backupCodes };
  }

  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }
}
