import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import * as cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const frontendUrl =
    config.get<string>("FRONTEND_URL") || "http://localhost:5173";

  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.enableCors({
    origin: frontendUrl.split(",").map((item) => item.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT || 3000, "0.0.0.0");
}

bootstrap();
