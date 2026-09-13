import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Interests } from './interests';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

/**
 * The recovery path for skipped onboarding: interests are editable any time,
 * prefilled from the read endpoint, saved with the same whole-list PUT —
 * including down to empty (clearing all tags is valid).
 */
describe('Interests', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([Interests]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Interests);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const serverTags = {
    tags: [{ tagId: 't1', name: 'synths', slug: 'synths', tier: 'Primary', isPublic: true }],
  };

  it('prefills from the server', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/tags').flush(serverTags);
    fixture.detectChanges();
    expect(el.textContent).toContain('synths');
  });

  it('saves the whole list with a PUT', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/tags').flush(serverTags);
    fixture.detectChanges();

    const save = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Save interests',
    ) as HTMLButtonElement;
    save.click();
    const req = expectApi(http, '/users/me/tags');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      tags: [{ name: 'synths', tier: 'Primary', isPublic: true }],
    });
    req.flush({ tags: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Interests saved.');
  });
});
