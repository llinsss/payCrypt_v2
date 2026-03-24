import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { UsersModule } from "./modules/users/users.module";
import { DeprecationInterceptor } from "./interceptors/deprecation.interceptor";

@Module({
  imports: [UsersModule],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: DeprecationInterceptor,
    },
  ],
})
export class AppModule {}
