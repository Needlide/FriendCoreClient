import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Profile } from './profile';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const profile = {
  userId: 'u1',
  username: 'bob',
  displayName: 'Bob',
  bio: 'synth nerd',
  websiteUrl: 'https://bob.example',
  location: 'Kyiv',
  isVerified: false,
  createdAt: new Date().toISOString(),
};

const me = {
  accessToken: 'token',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: 'u9',
  username: 'alice',
  displayName: 'Alice',
  isEmailVerified: true,
};

function post(id: string) {
  return {
    id,
    authorId: 'u1',
    authorUsername: 'bob',
    authorDisplayName: 'Bob',
    content: `post ${id}`,
    sensitivity: 'General',
    likeCount: 0,
    commentCount: 0,
    isLikedByCurrentUser: false,
    createdAt: new Date().toISOString(),
    media: [],
    tags: [],
  };
}

describe('Profile', () => {
  let http: HttpTestingController;

  async function setup(username: string, sessionUsername = 'alice') {
    await configureAuthTestBed([Profile]);
    // The component subscribes to paramMap (profile-to-profile navigation reuses the
    // instance), so stub the observable — not just the snapshot.
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        paramMap: of(convertToParamMap({ username })),
        snapshot: { paramMap: convertToParamMap({ username }) },
      },
    });
    http = TestBed.inject(HttpTestingController);
    // Session is set only through the service — sign in for real, then create.
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush({ ...me, username: sessionUsername });
    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  afterEach(() => http.verify());

  it("renders another user's header, actions, and posts", async () => {
    const { fixture, el } = await setup('bob');
    expectApi(http, '/users/bob').flush(profile);
    expectApi(http, '/users/bob/posts').flush({ posts: [post('1')], nextCursor: null });
    fixture.detectChanges();

    expect(el.textContent).toContain('Bob');
    expect(el.textContent).toContain('@bob');
    expect(el.textContent).toContain('synth nerd');
    expect(el.querySelector('fc-follow-button')).not.toBeNull();
    expect(el.querySelector('fc-block-mute-menu')).not.toBeNull();
    expect(el.querySelectorAll('fc-post-card').length).toBe(1);
  });

  it('shows Edit profile instead of actions on your own page', async () => {
    const { fixture, el } = await setup('alice', 'alice');
    expectApi(http, '/users/alice').flush({ ...profile, username: 'alice', userId: 'u9' });
    expectApi(http, '/users/alice/posts').flush({ posts: [], nextCursor: null });
    fixture.detectChanges();

    expect(el.querySelector('a[href="/settings/profile"]')).not.toBeNull();
    expect(el.querySelector('fc-follow-button')).toBeNull();
    expect(el.textContent).toContain('You haven’t posted yet.');
  });

  it('shows the same not-found copy for missing and blocked profiles', async () => {
    const { fixture, el } = await setup('ghost');
    expectApi(http, '/users/ghost').flush(
      [{ code: 'User.NotFound', description: 'User was not found.' }],
      { status: 404, statusText: 'Not Found' },
    );
    fixture.detectChanges();
    expect(el.textContent).toContain('Profile not found');
    expect(el.textContent).not.toContain('blocked');
  });

  it('loads followers lazily on first tab open', async () => {
    const { fixture, el } = await setup('bob');
    expectApi(http, '/users/bob').flush(profile);
    expectApi(http, '/users/bob/posts').flush({ posts: [], nextCursor: null });
    fixture.detectChanges();
    http.expectNone((req) => req.url.endsWith('/users/bob/followers'));

    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    tabs.find((t) => t.textContent?.trim() === 'Followers')!.click();
    expectApi(http, '/users/bob/followers').flush({
      users: [{ userId: 'u9', username: 'alice', displayName: 'Alice', isVerified: true }],
    });
    fixture.detectChanges();
    expect(el.querySelectorAll('fc-user-card').length).toBe(1);
  });

  it('opens a 1:1 from the Message button via find-or-create', async () => {
    const { fixture, el } = await setup('bob');
    expectApi(http, '/users/bob').flush(profile);
    expectApi(http, '/users/bob/posts').flush({ posts: [], nextCursor: null });
    fixture.detectChanges();

    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const messageButton = Array.from(el.querySelectorAll('.side button')).find(
      (b) => b.textContent?.trim() === 'Message',
    ) as HTMLButtonElement;
    messageButton.click();
    const req = expectApi(http, '/conversations');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'bob' });
    req.flush({
      id: 'c9',
      otherParticipant: profile,
      lastMessageAt: profile.createdAt,
      unreadCount: 0,
    });
    expect(navigate).toHaveBeenCalledWith(['/messages', 'c9']);
  });

  it('shows a retryable error when opening the conversation fails', async () => {
    const { fixture, el } = await setup('bob');
    expectApi(http, '/users/bob').flush(profile);
    expectApi(http, '/users/bob/posts').flush({ posts: [], nextCursor: null });
    fixture.detectChanges();

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const messageButton = Array.from(el.querySelectorAll('.side button')).find(
      (b) => b.textContent?.trim() === 'Message',
    ) as HTMLButtonElement;
    messageButton.click();
    expectApi(http, '/conversations').flush(null, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't open the conversation.",
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('seeds follower-list follow buttons from isFollowedByViewer', async () => {
    const { fixture, el } = await setup('bob');
    expectApi(http, '/users/bob').flush(profile);
    expectApi(http, '/users/bob/posts').flush({ posts: [], nextCursor: null });
    fixture.detectChanges();

    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    tabs.find((t) => t.textContent?.trim() === 'Followers')!.click();
    expectApi(http, '/users/bob/followers').flush({
      users: [
        {
          userId: 'u2',
          username: 'carol',
          displayName: 'Carol',
          isVerified: false,
          isFollowedByViewer: true,
        },
      ],
    });
    fixture.detectChanges();
    expect(el.querySelector('fc-user-card fc-follow-button')?.textContent).toContain('Following');
  });

  it('navigates home after you block them (their page is a 404 for you now)', async () => {
    const { fixture, el } = await setup('bob');
    expectApi(http, '/users/bob').flush(profile);
    expectApi(http, '/users/bob/posts').flush({ posts: [], nextCursor: null });
    fixture.detectChanges();

    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const blockItem = Array.from(el.querySelectorAll('fc-block-mute-menu .items button')).find(
      (b) => b.textContent?.includes('Block'),
    ) as HTMLButtonElement;
    blockItem.click();
    expectApi(http, '/users/bob/block').flush(null);
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  /**
   * Regression for the "page B, visuals of page A" bug: fast clicks (or a slow
   * connection) let the FIRST profile response arrive AFTER the second one.
   *
   * switchMap unsubscribes the superseded request, so alice's late response has no
   * subscriber left and the view stays on bob. Before the fix, alice's response
   * landed last and repainted the header, the follow/message buttons and isSelf()
   * with the wrong account — so following or blocking hit the wrong person.
   */
  it('ignores a superseded profile response that arrives late', async () => {
    await configureAuthTestBed([Profile]);
    const paramMap$ = new BehaviorSubject(convertToParamMap({ username: 'alice' }));
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: paramMap$, snapshot: { paramMap: paramMap$.value } },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush({ ...me, username: 'carol' });

    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    // alice is requested and still unresolved when we navigate away.
    const lateAlice = http.expectOne((r) => r.url.endsWith('/users/alice'));

    paramMap$.next(convertToParamMap({ username: 'bob' }));
    fixture.detectChanges();

    // switchMap unsubscribed alice's request the moment bob's :username arrived,
    // so the superseded response is no longer deliverable at all.
    expect(lateAlice.cancelled).toBe(true);

    // bob (the page we are actually on) resolves normally.
    expectApi(http, '/users/bob').flush({ ...profile, username: 'bob', displayName: 'Bobby' });
    expectApi(http, '/users/bob/posts').flush({ posts: [post('1')], nextCursor: null });
    fixture.detectChanges();
    expect(el.textContent).toContain('Bobby');
    expect(el.textContent).not.toContain('Alice');
  });

  /** Regression: the header used to render above the PREVIOUS user's posts. */
  it('clears the previous user’s posts before loading the next profile', async () => {
    await configureAuthTestBed([Profile]);
    const paramMap$ = new BehaviorSubject(convertToParamMap({ username: 'alice' }));
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { paramMap: paramMap$, snapshot: { paramMap: paramMap$.value } },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush({ ...me, username: 'carol' });

    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expectApi(http, '/users/alice').flush({ ...profile, username: 'alice', displayName: 'Alice' });
    expectApi(http, '/users/alice/posts').flush({ posts: [post('a1')], nextCursor: 'c1' });
    fixture.detectChanges();
    expect(el.textContent).toContain('post a1');

    paramMap$.next(convertToParamMap({ username: 'dave' }));
    fixture.detectChanges();
    // Header arrived, posts have not: alice's post must not still be on screen.
    expectApi(http, '/users/dave').flush({ ...profile, username: 'dave', displayName: 'Dave' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Dave');
    expect(el.textContent).not.toContain('post a1');

    expectApi(http, '/users/dave/posts').flush({ posts: [post('d1')], nextCursor: null });
    fixture.detectChanges();
    expect(el.textContent).toContain('post d1');
  });
});
