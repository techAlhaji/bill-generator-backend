import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../logger/index.js';

export interface InvalidParam {
  name: string;
  reason: string;
}

export interface ProblemDetailsPayload {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  timestamp: string;
  invalidParams?: InvalidParam[];
}

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly type: string;
  public readonly title: string;
  public readonly invalidParams?: InvalidParam[];

  constructor(opts: {
    status: number;
    code: string;
    title: string;
    detail: string;
    type?: string;
    invalidParams?: InvalidParam[];
  }) {
    super(opts.detail);
    this.name = 'AppError';
    this.status = opts.status;
    this.code = opts.code;
    this.title = opts.title;
    this.type = opts.type ?? `https://errors.stellarbills.com/${opts.code.toLowerCase().replace(/_/g, '-')}`;
    this.invalidParams = opts.invalidParams;
  }
}

// Common error helpers
export const Errors = {
  validation(detail: string, invalidParams?: InvalidParam[]) {
    return new AppError({
      status: 400,
      code: 'VALIDATION_ERROR',
      title: 'Validation Error',
      detail,
      invalidParams,
    });
  },
  unauthorized(detail = 'Missing or invalid authentication credentials.') {
    return new AppError({
      status: 401,
      code: 'UNAUTHORIZED',
      title: 'Unauthorized',
      detail,
    });
  },
  forbidden(detail = 'You do not have permission to access this resource.') {
    return new AppError({
      status: 403,
      code: 'FORBIDDEN',
      title: 'Forbidden',
      detail,
    });
  },
  notFound(detail = 'The requested resource was not found.') {
    return new AppError({
      status: 404,
      code: 'NOT_FOUND',
      title: 'Resource Not Found',
      detail,
    });
  },
  conflict(detail: string, code = 'RESOURCE_CONFLICT') {
    return new AppError({
      status: 409,
      code,
      title: 'Resource Conflict',
      detail,
    });
  },
  invoiceNotEditable(detail = 'Cannot update an invoice that has already been issued, paid, or cancelled.') {
    return new AppError({
      status: 409,
      code: 'INVOICE_NOT_EDITABLE',
      title: 'Invoice Not Editable',
      detail,
    });
  },
  paymentVerificationFailed(detail: string, code: string, invalidParams?: InvalidParam[]) {
    return new AppError({
      status: 422,
      code,
      title: 'Payment Verification Failed',
      detail,
      invalidParams,
    });
  },
  upstreamRpc(detail = 'Failed to communicate with Stellar Horizon or Soroban RPC.') {
    return new AppError({
      status: 502,
      code: 'UPSTREAM_RPC_ERROR',
      title: 'Upstream RPC Error',
      detail,
    });
  },
  serviceUnavailable(detail = 'One or more required services are unavailable.') {
    return new AppError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      title: 'Service Unavailable',
      detail,
    });
  },
};

export function errorHandler(error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) {
  const instance = req.url;
  const timestamp = new Date().toISOString();

  // Handle AppError
  if (error instanceof AppError) {
    const payload: ProblemDetailsPayload = {
      type: error.type,
      title: error.title,
      status: error.status,
      detail: error.message,
      instance,
      code: error.code,
      timestamp,
      ...(error.invalidParams && error.invalidParams.length > 0 ? { invalidParams: error.invalidParams } : {}),
    };
    return reply.status(error.status).type('application/problem+json').send(payload);
  }

  // Handle ZodError
  if (error instanceof ZodError) {
    const invalidParams: InvalidParam[] = error.errors.map((e) => ({
      name: e.path.join('.'),
      reason: e.message,
    }));
    const payload: ProblemDetailsPayload = {
      type: 'https://errors.stellarbills.com/validation-error',
      title: 'Validation Error',
      status: 400,
      detail: 'The submitted request payload failed schema validation.',
      instance,
      code: 'VALIDATION_ERROR',
      timestamp,
      invalidParams,
    };
    return reply.status(400).type('application/problem+json').send(payload);
  }

  // Handle Fastify Validation Error
  if ('validation' in error && Array.isArray((error as FastifyError).validation)) {
    const fastifyErr = error as FastifyError;
    const invalidParams: InvalidParam[] = (fastifyErr.validation || []).map((v) => ({
      name: v.instancePath || v.params?.missingProperty?.toString() || 'field',
      reason: v.message || 'Validation failed',
    }));
    const payload: ProblemDetailsPayload = {
      type: 'https://errors.stellarbills.com/validation-error',
      title: 'Validation Error',
      status: 400,
      detail: error.message,
      instance,
      code: 'VALIDATION_ERROR',
      timestamp,
      invalidParams,
    };
    return reply.status(400).type('application/problem+json').send(payload);
  }

  // Handle Fastify 404 (route not found)
  if ('statusCode' in error && error.statusCode === 404) {
    const payload: ProblemDetailsPayload = {
      type: 'https://errors.stellarbills.com/not-found',
      title: 'Not Found',
      status: 404,
      detail: error.message || 'Route not found',
      instance,
      code: 'NOT_FOUND',
      timestamp,
    };
    return reply.status(404).type('application/problem+json').send(payload);
  }

  // Handle Rate Limiter (429)
  if ('statusCode' in error && error.statusCode === 429) {
    const payload: ProblemDetailsPayload = {
      type: 'https://errors.stellarbills.com/rate-limit-exceeded',
      title: 'Too Many Requests',
      status: 429,
      detail: 'Rate limit exceeded. Please retry after some time.',
      instance,
      code: 'RATE_LIMIT_EXCEEDED',
      timestamp,
    };
    return reply.status(429).type('application/problem+json').send(payload);
  }

  // Log unhandled server error
  logger.error({ err: error, url: req.url, method: req.method }, 'Unhandled internal server error');

  const payload: ProblemDetailsPayload = {
    type: 'https://errors.stellarbills.com/internal-server-error',
    title: 'Internal Server Error',
    status: 500,
    detail: 'An unexpected internal error occurred on the server.',
    instance,
    code: 'INTERNAL_SERVER_ERROR',
    timestamp,
  };
  return reply.status(500).type('application/problem+json').send(payload);
}
