import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";
import { randomUUID } from "crypto";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const request = http.getRequest<Request & { requestId?: string }>();
    const response = http.getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const raw = error instanceof HttpException ? error.getResponse() : null;
    const message = typeof raw === "string" ? raw : (raw as { message?: string | string[] } | null)?.message;
    response.status(status).json({ success: false, error: { code: status === 422 ? "VALIDATION_ERROR" : status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICT" : "REQUEST_FAILED", message: Array.isArray(message) ? "Data tidak valid." : message || "Terjadi kesalahan pada server.", ...(Array.isArray(message) ? { details: message } : {}) }, meta: { requestId: request.requestId || randomUUID(), timestamp: new Date().toISOString() } });
  }
}
