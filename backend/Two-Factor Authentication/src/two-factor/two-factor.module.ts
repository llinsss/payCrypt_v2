import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TwoFactorController } from "./two-factor.controller";
import { TwoFactorService } from "./two-factor.service";
import { User } from "../entities/user.entity";

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [TwoFactorController],
  providers: [TwoFactorService],
  exports: [TwoFactorService],
})
export class TwoFactorModule {}
