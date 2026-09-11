import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

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
  private readonly base = environment.apiBaseUrl + environment.apiPrefix;

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
