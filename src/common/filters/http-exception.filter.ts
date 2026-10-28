import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

type ErrorPayload = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export class DomainError extends HttpException {
  constructor(
    public readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.CONFLICT,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ error: { code, message, details } }, status);
  }
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ErrorPayload = {
      error: { code: 'internal_error', message: 'Internal server error' },
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();

      if (
        typeof resp === 'object' &&
        resp !== null &&
        'error' in resp &&
        typeof (resp as Record<string, unknown>).error === 'object'
      ) {
        body = resp as ErrorPayload;
      } else if (typeof resp === 'object' && resp !== null) {
        const r = resp as Record<string, unknown>;
        const message = Array.isArray(r.message)
          ? r.message.join('; ')
          : typeof r.message === 'string'
            ? r.message
            : exception.message;
        const code = this.inferCode(status);
        body = {
          error: {
            code,
            message,
            details: Array.isArray(r.message) ? { issues: r.message } : undefined,
          },
        };
      } else {
        body = {
          error: {
            code: this.inferCode(status),
            message: typeof resp === 'string' ? resp : exception.message,
          },
        };
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled error on ${request.method} ${request.url}: ${exception.message}`,
        exception.stack,
      );
    }

    response.status(status).json(body);
  }

  private inferCode(status: number): string {
    switch (status) {
      case 400:
        return 'validation_error';
      case 401:
        return 'unauthorized';
      case 403:
        return 'role_forbidden';
      case 404:
        return 'not_found';
      case 409:
        return 'conflict';
      case 503:
        return 'service_unavailable';
      default:
        return 'internal_error';
    }
  }
}
