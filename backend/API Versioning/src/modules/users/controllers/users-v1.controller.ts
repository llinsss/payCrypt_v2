import { Controller, Get, Param, Version } from "@nestjs/common";
import { UsersService } from "../users.service";

@Controller("users")
export class UsersV1Controller {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Version("1")
  findAll() {
    return {
      data: this.usersService.findAllV1(),
      meta: {
        version: "v1",
        deprecated: true,
        message:
          "This version is deprecated. Please migrate to v2. See /docs/API_MIGRATION_V1_TO_V2.md",
      },
    };
  }

  @Get(":id")
  @Version("1")
  findOne(@Param("id") id: string) {
    const user = this.usersService.findOneV1(+id);
    return {
      data: user,
      meta: {
        version: "v1",
        deprecated: true,
        message:
          "This version is deprecated. Please migrate to v2. See /docs/API_MIGRATION_V1_TO_V2.md",
      },
    };
  }
}
