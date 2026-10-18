import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import * as cookieParser from "cookie-parser";
import * as express from "express";
import type { Request } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Meta signs the RAW webhook body. Re-serialising the parsed JSON changes
  // the bytes (key order, whitespace) and the HMAC would never match, so the
  // original buffer is stashed on the request before parsing.
  const captureRawBody = (req: Request, _res: unknown, buf: Buffer) => {
    if (buf?.length) (req as Request & { rawBody?: Buffer }).rawBody = buf;
  };
  app.use(express.json({ verify: captureRawBody }));
  app.use(express.urlencoded({ extended: true, verify: captureRawBody }));

  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>("WEB_ORIGIN", "http://localhost:5180"),
    credentials: true,
  });

  const port = config.get<number>("API_PORT", 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port}`);
}
bootstrap();
