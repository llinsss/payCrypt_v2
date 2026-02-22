import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { VersioningType } from "@nestjs/common";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable URI versioning
  app.enableVersioning({
    type: VersioningType.URI,
    prefix: "api/v",
  });

  await app.listen(3000);
  console.log("Application is running on: http://localhost:3000");
}
bootstrap();
