import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { normalizeHttpError } from './normalize-error';

/**
 * Outermost interceptor: normalizes any HttpErrorResponse that escapes the auth
 * interceptor into a uniform {@link import('../models/api-error').ApiError}.
 *
 * Registration order matters — this must be registered BEFORE the auth interceptor so
 * that on the error path (which runs in reverse) the auth interceptor sees the RAW
 * HttpErrorResponse first and can act on a real 401, while anything it rethrows is
 * normalized here.
 */
export const errorNormalizationInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err) =>
      throwError(() => (err instanceof HttpErrorResponse ? normalizeHttpError(err) : err)),
    ),
  );
