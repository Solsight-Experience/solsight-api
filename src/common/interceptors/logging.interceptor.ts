import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger(LoggingInterceptor.name);

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const { method, url, body, query, params } = request;
        const userAgent = request.get("User-Agent") || "";
        const ip = request.ip;

        this.logger.log(`Incoming Request: ${method} ${url} - ${userAgent} ${ip}`);

        const now = Date.now();
        return next.handle().pipe(
            tap(() => {
                const response = context.switchToHttp().getResponse();
                const { statusCode } = response;
                const contentLength = response.get("content-length");

                this.logger.log(`Outgoing Response: ${method} ${url} ${statusCode} ${contentLength} - ${Date.now() - now}ms`);
            })
        );
    }
}
