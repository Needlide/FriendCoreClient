import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { TagsEndpoints, UsersEndpoints } from '../../core/config/endpoints';
import { ProfileTagInput, TagAutocompleteResponse } from '../../core/models/tags.models';

/**
 * Tag operations: autocomplete suggestions and the profile tag list.
 * Thin, like AuthService's transport layer — components own UI state and Rx timing
 * (debounce lives in TagInput, where the keystrokes are), this just hits endpoints.
 */
@Injectable({ providedIn: 'root' })
export class TagsService {
  private readonly api = inject(ApiClient);

  /** GET /tags/autocomplete?q= — caller debounces; empty queries never reach here. */
  autocomplete(query: string): Observable<TagAutocompleteResponse> {
    return this.api.get<TagAutocompleteResponse>(TagsEndpoints.autocomplete, {
      params: { q: query },
    });
  }

  /**
   * PUT /users/me/tags — replaces the whole profile tag list. The server creates
   * unknown tags on the fly (after the user confirms — that's the "first to use it"
   * affordance), so names typed fresh from the input are fine here.
   */
  updateProfileTags(tags: ProfileTagInput[]): Observable<void> {
    return this.api.put<void>(UsersEndpoints.profileTags, { tags });
  }
}
