import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { resolveApiBaseUrl } from '../config/api-base-url';

interface RequestOptions {
  params?: HttpParams | Record<string, string | number | boolean>;
  headers?: HttpHeaders | Record<string, string>;
  context?: HttpContext;
}

/**
 * Thin wrapper over HttpClient that owns the base URL (`apiBaseUrl + apiPrefix`).
 * Credentials, the bearer token, the single-flight refresh, and error normalization
 * are all handled by interceptors — this just builds versioned URLs and types results.
 *
 * `path` is relative to /api/v1, e.g. `client.get('/feed/home')`.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  /**
   * Same-origin by default. An empty apiBaseUrl means "talk to whatever host served this page",
   * which is what you want when the API serves the built SPA: one build then works from a LAN
   * IP, a WireGuard address or a hostname, with no rebuild per environment — and no cross-origin
   * request, so Cors:AllowedOrigins stops being a per-environment chore.
   *
   * Falls back to the configured base URL when set, so pointing a dev build at a remote API
   * still works exactly as before.
   */
  private readonly base = resolveApiBaseUrl() + environment.apiPrefix;

  /** Absolute URL for a versioned API path. */
  url(path: string): string {
    return this.base + path;
  }

  get<T>(path: string, options?: RequestOptions): Observable<T> {
    return this.http.get<T>(this.url(path), options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? {}, options);
  }

  put<T>(path: string, body?: unknown, options?: RequestOptions): Observable<T> {
    return this.http.put<T>(this.url(path), body ?? {}, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Observable<T> {
    return this.http.patch<T>(this.url(path), body ?? {}, options);
  }

  delete<T>(path: string, options?: RequestOptions): Observable<T> {
    return this.http.delete<T>(this.url(path), options);
  }
}
