import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { SKIP_AUTH } from './http-context';

/**
 * Adds credentials + bearer to outgoing requests and runs the single-flight
 * refresh-and-retry on 401.
 *
 *  - `withCredentials: true` on EVERY request so Set-Cookie is stored and the
 *    `fc_refresh` cookie is sent back on the auth routes (guide §1).
 *  - On a 401 for a protected call, it awaits {@link AuthService.refresh} (a single
 *    shared in-flight promise — replaying a rotated refresh token revokes the whole
 *    family and logs the user out), then retries the original request once with the
 *    new access token. If the refresh itself fails, the session is cleared.
 *
 * Must be registered AFTER the error-normalization interceptor (it needs the raw
 * HttpErrorResponse to read the 401 status).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const skip = req.context.get(SKIP_AUTH);

  let request = req.clone({ withCredentials: true });

  const token = auth.accessToken();
  if (token && !skip) {
    request = request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(request).pipe(
    catchError((err) => {
      const status = err instanceof HttpErrorResponse ? err.status : 0;
      if (status !== 401 || skip) {
        return throwError(() => err);
      }

      return auth.refresh().pipe(
        switchMap((session) =>
          next(request.clone({ setHeaders: { Authorization: `Bearer ${session.accessToken}` } })),
        ),
        catchError(() => {
          // Refresh failed (rotated/revoked token or expired family) → hard logout.
          auth.clearSession();
          return throwError(() => err);
        }),
      );
    }),
  );
};
