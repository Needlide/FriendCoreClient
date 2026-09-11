import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, takeWhile, throwError, timeout, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { ApiClient } from '../../core/api/api-client';
import { MediaEndpoints } from '../../core/config/endpoints';
import {
  MediaStatusResponse,
  MediaUploadResponse,
  UploadProgress,
} from '../../core/models/posts.models';

export type { UploadProgress };

/**
 * Media transport. Upload goes through raw HttpClient — not ApiClient — for one
 * reason: progress events. ApiClient returns only the final body; `reportProgress`
 * + `observe: 'events'` is how the browser reports bytes-sent, and that needs the
 * event stream. Everything else (base URL, interceptors) still applies: the URL
 * comes from `ApiClient.url()`, and interceptors run on every HttpClient call.
 */
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiClient);

  /** POST /media as multipart/form-data, emitting 0–100 upload percent. */
  upload(
    file: File,
    flags: { hasFlashingWarning: boolean; hasIntenseMotionWarning: boolean },
  ): Observable<UploadProgress | MediaUploadResponse> {
    const form = new FormData();
    form.append('File', file, file.name);
    form.append('HasFlashingWarning', String(flags.hasFlashingWarning));
    form.append('HasIntenseMotionWarning', String(flags.hasIntenseMotionWarning));

    return this.http
      .post<MediaUploadResponse>(this.api.url(MediaEndpoints.media), form, {
        reportProgress: true,
        observe: 'events',
        withCredentials: true,
      })
      .pipe(
        map((event: HttpEvent<MediaUploadResponse>): UploadProgress | MediaUploadResponse => {
          if (event.type === HttpEventType.UploadProgress) {
            const percent = event.total ? Math.round((100 * event.loaded) / event.total) : 0;
            return { percent };
          }
          if (event.type === HttpEventType.Response && event.body) return event.body;
          return { percent: 0 };
        }),
      );
  }

  /** GET /media/{id}/status — one shot; the composer polls it (see below). */
  status(id: string): Observable<MediaStatusResponse> {
    return this.api.get<MediaStatusResponse>(MediaEndpoints.status(id));
  }

  /**
   * Poll until the media leaves Processing. `takeWhile(predicate, true)` — the
   * `true` means INCLUSIVE: it emits the final Ready/Failed too, then completes.
   * `timeout` guards a stuck worker (60 s): better a local error than a forever spinner.
   */
  waitUntilReady(id: string): Observable<MediaStatusResponse> {
    return timer(0, 1500).pipe(
      switchMap(() => this.status(id)),
      takeWhile((res) => res.status === 'Processing', true),
      timeout(60_000),
    );
  }

  deleteMedia(id: string): Observable<void> {
    return this.api.delete<void>(MediaEndpoints.byId(id));
  }
}
