import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
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
});
