import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protects authenticated routes. By the time guards run, {@link AuthService.bootstrap}
 * (the app initializer) has already attempted to restore the session, so this just reads
 * the in-memory state. Redirects to /login otherwise (route added when the UI is built).
 */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? true : router.createUrlTree(['/auth/login']);
};

/** Inverse of {@link authGuard}: keeps signed-in users off login/register pages. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isAuthenticated() ? router.createUrlTree(['/']) : true;
};
