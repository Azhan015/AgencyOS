/**
 * Unit Tests — lib/errors.ts
 * Verifies each error class has the correct status code, code, and message.
 */
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  PaymentError,
  FileError,
} from '../../lib/errors';

describe('AppError hierarchy', () => {
  it('AppError stores statusCode and isOperational', () => {
    const err = new AppError('oops', 500, 'INTERNAL');
    expect(err.message).toBe('oops');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL');
    expect(err.isOperational).toBe(true);
    expect(err instanceof Error).toBe(true);
  });

  it('ValidationError → 400 VALIDATION_ERROR', () => {
    const err = new ValidationError('bad input', { field: 'email' });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual({ field: 'email' });
  });

  it('AuthenticationError → 401 AUTHENTICATION_ERROR', () => {
    const err = new AuthenticationError();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTHENTICATION_ERROR');
    expect(err.message).toBe('Authentication required');
  });

  it('AuthorizationError → 403 AUTHORIZATION_ERROR', () => {
    const err = new AuthorizationError('no access');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('AUTHORIZATION_ERROR');
  });

  it('NotFoundError → 404 NOT_FOUND', () => {
    const err = new NotFoundError('User');
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('User not found');
  });

  it('ConflictError → 409 CONFLICT', () => {
    const err = new ConflictError('Email already exists');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
  });

  it('RateLimitError → 429 RATE_LIMIT_EXCEEDED', () => {
    const err = new RateLimitError();
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('PaymentError → 402 PAYMENT_ERROR', () => {
    const err = new PaymentError('card declined');
    expect(err.statusCode).toBe(402);
    expect(err.code).toBe('PAYMENT_ERROR');
  });

  it('FileError → 422 FILE_ERROR', () => {
    const err = new FileError('too large');
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('FILE_ERROR');
  });

  it('instanceof checks work correctly', () => {
    const err = new NotFoundError('Project');
    expect(err instanceof AppError).toBe(true);
    expect(err instanceof NotFoundError).toBe(true);
    expect(err instanceof ValidationError).toBe(false);
  });
});
