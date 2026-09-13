import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { normalizeHttpError } from './normalize-error';

function failure(status: number, body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({
    error: body,
    status,
    statusText: 'x',
    url: 'http://localhost:5024/api/v1/feed/home',
  });
}

describe('normalizeHttpError fallback', () => {
  it('maps an empty 404 to "Not found." (never raw transport text)', () => {
    const err = normalizeHttpError(failure(404, null));
    expect(err.errors[0]?.description).toBe('Not found.');
  });

  it('maps an empty 500 to the server-side message', () => {
    const err = normalizeHttpError(failure(500, null));
    expect(err.errors[0]?.description).toContain('on our side');
  });

  it('ignores raw string bodies in favor of friendly copy', () => {
    const err = normalizeHttpError(failure(404, '<html>nginx</html>'));
    expect(err.errors[0]?.description).toBe('Not found.');
  });

  it('still prefers the server array when present', () => {
    const err = normalizeHttpError(
      failure(409, [{ code: 'User.BlockRequiresConfirmation', description: 'Confirm.' }]),
    );
    expect(err.code).toBe('User.BlockRequiresConfirmation');
    expect(err.errors[0]?.description).toBe('Confirm.');
  });

  it('parses the PascalCase rate-limit body plus Retry-After', () => {
    const httpErr = new HttpErrorResponse({
      error: { Code: 'Common.RateLimited', Description: 'Slow down.' },
      headers: new HttpHeaders({ 'Retry-After': '42' }),
      status: 429,
      statusText: 'Too Many Requests',
      url: 'http://localhost:5024/api/v1/auth/login',
    });
    const err = normalizeHttpError(httpErr);
    expect(err.isRateLimited).toBe(true);
    expect(err.retryAfterSeconds).toBe(42);
    expect(err.errors[0]?.description).toBe('Slow down.');
  });
});
