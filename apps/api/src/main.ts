import "./config/load-local-env";
import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { AuthGuard } from "./common/auth.guard";
import { ApiExceptionFilter } from "./common/http-exception.filter";
import { ResponseInterceptor } from "./common/response.interceptor";
import { AuditInterceptor } from "./common/audit.interceptor";
import { PrismaService } from "./database/prisma.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); app.use(helmet()); app.use(cookieParser());
  app.enableCors({ origin: (process.env.CORS_ORIGINS || "http://localhost:3000").split(","), credentials: true });
  app.setGlobalPrefix("api/v1", { exclude: ["health/live", "health/ready"] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, errorHttpStatusCode: 422 }));
  app.useGlobalFilters(new ApiExceptionFilter()); app.useGlobalInterceptors(new AuditInterceptor(app.get(PrismaService)), new ResponseInterceptor());
  app.useGlobalGuards(new AuthGuard(app.get(PrismaService), app.get(Reflector)));
  if (process.env.NODE_ENV !== "production") {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("ISM API").setVersion("1.0.0").addCookieAuth("ism_session").addBearerAuth().build());
    SwaggerModule.setup("api/docs", app, document);
  }
  await app.listen(Number(process.env.PORT ?? 8001), "0.0.0.0");
}
bootstrap();
