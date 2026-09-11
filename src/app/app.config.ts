import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/http/auth.interceptor';
import { errorNormalizationInterceptor } from './core/http/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),

    // Interceptor order is deliberate: error-normalization is outermost so the auth
    // interceptor (inner) still sees the raw 401 it needs to drive the refresh.
    provideHttpClient(
      withFetch(),
      withInterceptors([errorNormalizationInterceptor, authInterceptor]),
    ),

    // Restore the session from the refresh cookie before the app renders, so route
    // guards see the correct auth state. Never throws (bootstrap swallows a 401 → null).
    provideAppInitializer(() => firstValueFrom(inject(AuthService).bootstrap())),
  ],
};
