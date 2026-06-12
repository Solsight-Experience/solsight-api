import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from "@nestjs/common";
import { Request, Response } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { JsonValue } from "../types";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger(LoggingInterceptor.name);

    intercept(context: ExecutionContext, next: CallHandler<JsonValue>): Observable<JsonValue> {
        const request = context.switchToHttp().getRequest<Request>();
        const { method, url } = request;
        const userAgent = request.get("User-Agent") || "";
        const ip = request.ip;

        this.logger.log(`Incoming Request: ${method} ${url} - ${userAgent} ${ip}`);

        const now = Date.now();
        return next.handle().pipe(
            tap(() => {
                const response = context.switchToHttp().getResponse<Response>();
                const { statusCode } = response;
                const contentLength = response.get("content-length");

                this.logger.log(`Outgoing Response: ${method} ${url} ${statusCode} ${contentLength} - ${Date.now() - now}ms`);
            })
        );
    }
}
