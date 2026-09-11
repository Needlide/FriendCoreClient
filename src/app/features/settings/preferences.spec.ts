import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Preferences } from './preferences';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const serverPrefs = {
  hideFlashingMedia: true,
  reduceMotion: false,
  disableAutoplay: true,
  reduceVisualNoise: false,
  contentPreference: 'General',
};

describe('Preferences page', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([Preferences]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Preferences);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('loads toggles from the server and saves the whole set', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/preferences').flush(serverPrefs);
    fixture.detectChanges();

    // Flip one toggle and save — the PATCH carries every field, not just the delta.
    const boxes = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    boxes[1]!.click(); // Reduce motion
    el.querySelector<HTMLButtonElement>('.fc-primary')!.click();

    const req = expectApi(http, '/users/me/preferences');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toMatchObject({ reduceMotion: true, hideFlashingMedia: true });
    req.flush({ ...serverPrefs, reduceMotion: true });
    fixture.detectChanges();
    expect(el.textContent).toContain('Saved.');
  });
});
