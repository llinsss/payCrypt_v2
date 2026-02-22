import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Check if this is a v1 API call
    if (request.url.includes("/api/v1/")) {
      const sunsetDate = new Date();
      sunsetDate.setMonth(sunsetDate.getMonth() + 6);

      response.setHeader("X-API-Deprecation", "true");
      response.setHeader("X-API-Deprecated-Version", "v1");
      response.setHeader(
        "X-API-Sunset",
        sunsetDate.toISOString().split("T")[0],
      );
      response.setHeader("X-API-Current-Version", "v2");
      response.setHeader(
        "Link",
        '</docs/API_MIGRATION_V1_TO_V2.md>; rel="deprecation"',
      );
    }

    return next.handle().pipe(
      tap(() => {
        // Additional logging or metrics can be added here
      }),
    );
  }
}
