import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { UsersEndpoints } from '../../core/config/endpoints';

/**
 * Follow / block / mute transport, shared by discovery, onboarding rows, and (later)
 * profiles. All endpoints answer 204 with no body — components flip their own state
 * on success and roll back on error.
 *
 * Block's `confirmed` flag is the client's answer to a 409
 * `User.BlockRequiresConfirmation`: the client NEVER pre-checks follow state (it
 * can't — no such endpoint); the 409 itself is the signal to ask the user.
 */
@Injectable({ providedIn: 'root' })
export class SocialService {
  private readonly api = inject(ApiClient);

  follow(username: string): Observable<void> {
    return this.api.post<void>(UsersEndpoints.follow(username));
  }

  unfollow(username: string): Observable<void> {
    return this.api.delete<void>(UsersEndpoints.follow(username));
  }

  block(username: string, confirmed = false): Observable<void> {
    return this.api.post<void>(UsersEndpoints.block(username), { confirmed });
  }

  unblock(username: string): Observable<void> {
    return this.api.delete<void>(UsersEndpoints.block(username));
  }

  mute(username: string): Observable<void> {
    return this.api.post<void>(UsersEndpoints.mute(username));
  }

  unmute(username: string): Observable<void> {
    return this.api.delete<void>(UsersEndpoints.mute(username));
  }
}
