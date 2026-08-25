import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import * as cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

const DEFAULT_FRONTEND_ORIGINS = [
  "http://localhost:5173",
  "https://yechim-crm.vercel.app",
];

function normalizeOrigin(value: string) {
  const trimmed = value.trim();
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  if (config.get<string>("NODE_ENV") === "production" && (!config.get<string>("JWT_SECRET") || !config.get<string>("JWT_REFRESH_SECRET"))) {
    throw new Error("JWT_SECRET va JWT_REFRESH_SECRET production muhitida majburiy");
  }
  const frontendOrigins = [
    ...DEFAULT_FRONTEND_ORIGINS,
    ...(config.get<string>("FRONTEND_URL") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  ].map(normalizeOrigin).filter(Boolean);
  const allowedOrigins = [...new Set(frontendOrigins)];

  app.setGlobalPrefix("api");
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS origin ruxsat etilmagan: ${origin}`), false);
    },
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
