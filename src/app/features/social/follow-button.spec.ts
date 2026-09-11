import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { FollowButton } from './follow-button';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

describe('FollowButton', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([FollowButton]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(FollowButton);
    fixture.componentRef.setInput('username', 'bob');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function primaryButton(el: HTMLElement): HTMLButtonElement | null {
    return Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Follow' || b.textContent?.trim() === 'Following',
    ) as HTMLButtonElement | null;
  }

  it('follows on click and flips to Following', () => {
    const { fixture, el } = create();
    primaryButton(el)!.click();
    expectApi(http, '/users/bob/follow').flush(null);
    fixture.detectChanges();
    expect(primaryButton(el)?.textContent?.trim()).toBe('Following');
  });

  it('unfollows when clicked while following', () => {
    const { fixture, el } = create();
    primaryButton(el)!.click();
    expectApi(http, '/users/bob/follow').flush(null);
    fixture.detectChanges();

    primaryButton(el)!.click();
    const req = expectApi(http, '/users/bob/follow');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    fixture.detectChanges();
    expect(primaryButton(el)?.textContent?.trim()).toBe('Follow');
  });

  it('rolls back to Follow when the server rejects it', () => {
    const { fixture, el } = create();
    primaryButton(el)!.click();
    expectApi(http, '/users/bob/follow').flush(null, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(primaryButton(el)?.textContent?.trim()).toBe('Follow');
  });
});
