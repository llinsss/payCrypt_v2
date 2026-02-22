import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../entities/user.entity";
import { TwoFactorService } from "../../two-factor/two-factor.service";

@Injectable()
export class TwoFactorGuard implements CanActivate {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private twoFactorService: TwoFactorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException("User not authenticated");
    }

    const dbUser = await this.userRepository.findOne({
      where: { id: user.id },
    });

    if (!dbUser.twoFactorEnabled) {
      return true; // 2FA not enabled, allow access
    }

    const token = request.body.twoFactorToken || request.headers["x-2fa-token"];
    const backupCode = request.body.backupCode;

    if (token) {
      const isValid = this.twoFactorService.verifyToken(
        dbUser.twoFactorSecret,
        token,
      );
      if (isValid) {
        return true;
      }
    }

    if (backupCode) {
      const isValid = await this.twoFactorService.verifyBackupCode(
        dbUser.id,
        backupCode,
      );
      if (isValid) {
        return true;
      }
    }

    throw new UnauthorizedException("Invalid 2FA token or backup code");
  }
}
