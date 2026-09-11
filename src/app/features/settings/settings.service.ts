import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { ModerationEndpoints, UsersEndpoints } from '../../core/config/endpoints';
import {
  KeywordFiltersResponse,
  MyModerationActionsResponse,
  ReportCategory,
  ReportTarget,
  SubmitAppealRequest,
  UpdatePreferencesRequest,
  UserPreferences,
} from '../../core/models/settings.models';

/**
 * Settings + safety transport: preferences, keyword filters, appeals, reports.
 * Reports resolve the target to its endpoint here so the dialog stays dumb:
 * posts and users share the {category, note?} shape; media safety is a different
 * endpoint ({flashing, intenseMotion}) and gets its own flow later.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly api = inject(ApiClient);

  getPreferences(): Observable<UserPreferences> {
    return this.api.get<UserPreferences>(UsersEndpoints.preferences);
  }

  updatePreferences(request: UpdatePreferencesRequest): Observable<UserPreferences> {
    return this.api.patch<UserPreferences>(UsersEndpoints.preferences, request);
  }

  getKeywordFilters(): Observable<KeywordFiltersResponse> {
    return this.api.get<KeywordFiltersResponse>(UsersEndpoints.keywordFilters);
  }

  /** Whole-set replace: the list sent becomes the complete filter set. */
  updateKeywordFilters(keywords: string[]): Observable<KeywordFiltersResponse> {
    return this.api.patch<KeywordFiltersResponse>(UsersEndpoints.keywordFilters, {
      keywords,
    });
  }

  myModerationActions(): Observable<MyModerationActionsResponse> {
    return this.api.get<MyModerationActionsResponse>(ModerationEndpoints.myActions);
  }

  submitAppeal(request: SubmitAppealRequest): Observable<void> {
    return this.api.post<void>(ModerationEndpoints.appeals, request);
  }

  report(target: ReportTarget, category: ReportCategory, note?: string): Observable<void> {
    const body = { category, note: note?.trim() ? note.trim() : null };
    switch (target.kind) {
      case 'post':
        return this.api.post<void>(ModerationEndpoints.reportPost(target.id), body);
      case 'user':
        return this.api.post<void>(UsersEndpoints.reportUser(target.username), body);
      case 'media':
        // Deliberately unimplemented: media safety is {flashing, intenseMotion},
        // not {category, note} — it needs its own dialog, not this one.
        throw new Error('Media safety reports need a dedicated flow.');
    }
  }
}
