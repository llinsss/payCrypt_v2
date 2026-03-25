import { Controller, Get, Post, Body, Param, Version } from "@nestjs/common";
import { UsersService } from "../users.service";

@Controller("users")
export class UsersV2Controller {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Version("2")
  findAll() {
    return {
      data: this.usersService.findAllV2(),
      meta: {
        version: "v2",
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get(":id")
  @Version("2")
  findOne(@Param("id") id: string) {
    const user = this.usersService.findOneV2(+id);
    return {
      data: user,
      meta: {
        version: "v2",
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Post()
  @Version("2")
  create(
    @Body()
    createUserDto: {
      firstName: string;
      lastName: string;
      email: string;
    },
  ) {
    const user = this.usersService.createV2(createUserDto);
    return {
      data: user,
      meta: {
        version: "v2",
        timestamp: new Date().toISOString(),
      },
    };
  }
}
