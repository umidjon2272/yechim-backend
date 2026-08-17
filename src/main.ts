import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import * as cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

const DEFAULT_FRONTEND_ORIGINS = [
  "http://localhost:5173",
  "https://yechim-crm.vercel.app",
];

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const frontendOrigins = [
    ...DEFAULT_FRONTEND_ORIGINS,
    ...(config.get<string>("FRONTEND_URL") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ];

  app.setGlobalPrefix("api");
  app.use(cookieParser());
  app.enableCors({
    origin: ["https://yechim-crm.vercel.app", "http://localhost:5173"],
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
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
