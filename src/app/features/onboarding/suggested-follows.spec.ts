import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SuggestedFollows } from './suggested-follows';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

describe('SuggestedFollows', () => {
  let http: HttpTestingController;

  const people = {
    people: [
      { id: '1', username: 'bob', displayName: 'Bob', bio: 'synth nerd', matchScore: 20 },
      { id: '2', username: 'cara', displayName: 'Cara', bio: null, matchScore: 13 },
    ],
  };

  beforeEach(async () => {
    await configureAuthTestBed([SuggestedFollows]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function load() {
    const fixture = TestBed.createComponent(SuggestedFollows);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expectApi(http, '/feed/discovery/people').flush(people);
    fixture.detectChanges();
    return { fixture, el };
  }

  it('renders up to 10 suggested people', () => {
    const { el } = load();
    expect(el.querySelectorAll('.person').length).toBe(2);
    expect(el.textContent).toContain('@bob');
  });

  function followButton(el: HTMLElement): HTMLButtonElement | undefined {
    return Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Follow',
    );
  }

  function hasFollowButton(el: HTMLElement): boolean {
    return followButton(el) !== undefined;
  }

  it('follows on click and flips the row to Following', () => {
    const { fixture, el } = load();
    followButton(el)!.click();
    expectApi(http, '/users/bob/follow').flush(null);
    fixture.detectChanges();
    expect(el.textContent).toContain('Following');
  });

  it('rolls the row back when follow fails', () => {
    const { fixture, el } = load();
    followButton(el)!.click();
    expectApi(http, '/users/bob/follow').flush(null, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    // Still offers Follow — a failed request must never look completed.
    expect(hasFollowButton(el)).toBe(true);
  });

  it('offers retry with a calm message when discovery fails', () => {
    const fixture = TestBed.createComponent(SuggestedFollows);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expectApi(http, '/feed/discovery/people').flush(null, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(el.textContent).toContain("Couldn't load suggestions");
    expect(el.querySelector('button')?.textContent).toContain('Try again');
  });
});
