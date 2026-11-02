import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { UserPreferences } from '../../core/models/settings.models';
import { PreferencesService } from '../../core/preferences/preferences.service';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const serverPrefs: UserPreferences = {
  hideFlashingMedia: false,
  hideArachnidMedia: false,
  reduceMotion: true,
  disableAutoplay: false,
  reduceVisualNoise: true,
  contentPreference: 'Sensitive',
  sendMessageOnEnter: true,
};

describe('PreferencesService', () => {
  let http: HttpTestingController;
  let prefs: PreferencesService;

  beforeEach(async () => {
    await configureAuthTestBed([]);
    http = TestBed.inject(HttpTestingController);
    prefs = TestBed.inject(PreferencesService);
    delete document.documentElement.dataset['reduceMotion'];
    delete document.documentElement.dataset['reduceVisualNoise'];
  });

  afterEach(() => http.verify());

  it('fails safe before loading (protections on)', () => {
    expect(prefs.hideFlashingMedia()).toBe(true);
    expect(prefs.hideArachnidMedia()).toBe(true);
    expect(prefs.disableAutoplay()).toBe(true);
  });

  it('loads once and applies data-* attributes to <html>', () => {
    prefs.load().subscribe();
    expectApi(http, '/users/me/preferences').flush(serverPrefs);

    expect(prefs.hideFlashingMedia()).toBe(false);
    expect(prefs.hideArachnidMedia()).toBe(false);
    expect(prefs.contentPreference()).toBe('Sensitive');
    expect(document.documentElement.dataset['reduceMotion']).toBe('true');
    expect(document.documentElement.dataset['reduceVisualNoise']).toBe('true');
  });

  it('reuses the loaded value without a second request', () => {
    prefs.load().subscribe();
    expectApi(http, '/users/me/preferences').flush(serverPrefs);
    prefs.load().subscribe();
    http.expectNone((req) => req.url.endsWith('/users/me/preferences'));
  });

  it('saves the whole set and re-applies attributes', () => {
    prefs.load().subscribe();
    expectApi(http, '/users/me/preferences').flush(serverPrefs);

    prefs.update({ ...serverPrefs, reduceMotion: false }).subscribe();
    const req = expectApi(http, '/users/me/preferences');
    expect(req.request.method).toBe('PATCH');
    req.flush({ ...serverPrefs, reduceMotion: false });
    expect(document.documentElement.dataset['reduceMotion']).toBe('false');
  });
});
