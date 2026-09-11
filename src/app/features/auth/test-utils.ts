import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed, TestBedStatic } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from '../../core/http/auth.interceptor';
import { errorNormalizationInterceptor } from '../../core/http/error.interceptor';

/**
 * Shared TestBed setup for auth-screen specs. Registers the REAL interceptor chain
 * (error-normalization outside, single-flight auth inside — same order as app.config)
 * over the testing backend, so components receive the normalized `ApiError` exactly
 * as they do in production.
 */
export async function configureAuthTestBed(components: unknown[]): Promise<TestBedStatic> {
  await TestBed.configureTestingModule({
    imports: [...(components as never[])],
    providers: [
      provideHttpClient(withInterceptors([errorNormalizationInterceptor, authInterceptor])),
      provideHttpClientTesting(),
      provideRouter([]),
    ],
  }).compileComponents();
  return TestBed;
}

/** Matches a request by URL suffix — the suite runs against the default environment URL. */
export function expectApi(http: HttpTestingController, path: string) {
  return http.expectOne((req) => req.url.endsWith(path));
}
