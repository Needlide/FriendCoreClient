import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { DiscoveryEndpoints } from '../../core/config/endpoints';
import { DiscoveryPeopleResponse } from '../../core/models/tags.models';
import { DiscoveryPostsResponse } from '../../core/models/discovery.models';

/**
 * Discovery transport (read-only lists). Follow/block/mute live in SocialService —
 * shared with onboarding rows and future profiles.
 */
@Injectable({ providedIn: 'root' })
export class DiscoveryService {
  private readonly api = inject(ApiClient);

  /** GET /feed/discovery/people — single response, not paginated. */
  getPeople(): Observable<DiscoveryPeopleResponse> {
    return this.api.get<DiscoveryPeopleResponse>(DiscoveryEndpoints.people);
  }

  /** GET /feed/discovery/posts — single response, not paginated. */
  getPosts(): Observable<DiscoveryPostsResponse> {
    return this.api.get<DiscoveryPostsResponse>(DiscoveryEndpoints.posts);
  }
}
