import { Module } from "@nestjs/common";
import { UsersV1Controller } from "./controllers/users-v1.controller";
import { UsersV2Controller } from "./controllers/users-v2.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersV1Controller, UsersV2Controller],
  providers: [UsersService],
})
export class UsersModule {}
