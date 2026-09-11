import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { UsersEndpoints } from '../../core/config/endpoints';
import { PostFeedResponse } from '../../core/models/posts.models';
import {
  FollowListResponse,
  UpdateProfileRequest,
  UserProfile,
} from '../../core/models/profile.models';

/** Profile + user-posts + follow-list transport. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly api = inject(ApiClient);

  /** GET /users/{username} — 404 covers missing AND blocked (never distinguish). */
  getProfile(username: string): Observable<UserProfile> {
    return this.api.get<UserProfile>(UsersEndpoints.profile(username));
  }

  /** GET /users/{username}/posts — same cursor shape as the home feed. */
  getPosts(username: string, cursor?: string | null): Observable<PostFeedResponse> {
    return this.api.get<PostFeedResponse>(UsersEndpoints.userPosts(username), {
      params: cursor ? { cursor } : {},
    });
  }

  getFollowers(username: string): Observable<FollowListResponse> {
    return this.api.get<FollowListResponse>(UsersEndpoints.followers(username));
  }

  getFollowing(username: string): Observable<FollowListResponse> {
    return this.api.get<FollowListResponse>(UsersEndpoints.following(username));
  }

  updateProfile(request: UpdateProfileRequest): Observable<UserProfile> {
    return this.api.patch<UserProfile>(UsersEndpoints.updateProfile, request);
  }
}
