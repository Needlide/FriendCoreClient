import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { PostDetail } from './post-detail';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const me = {
  accessToken: 'token',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: 'me',
  username: 'alice',
  displayName: 'Alice',
  isEmailVerified: true,
};

function post() {
  return {
    id: 'p1',
    authorId: 'a1',
    authorUsername: 'bob',
    authorDisplayName: 'Bob',
    content: 'hello https://example.com',
    sensitivity: 'General',
    likeCount: 0,
    commentCount: 2,
    isLikedByCurrentUser: false,
    createdAt: new Date().toISOString(),
    media: [],
    tags: [],
  };
}

function comment(id: string, authorId = 'a2', username = 'cara') {
  return {
    id,
    postId: 'p1',
    authorId,
    authorUsername: username,
    authorDisplayName: username,
    content: `comment ${id}`,
    createdAt: new Date().toISOString(),
  };
}

describe('PostDetail', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([PostDetail]);
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        paramMap: of(convertToParamMap({ id: 'p1' })),
        snapshot: { paramMap: convertToParamMap({ id: 'p1' }) },
      },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(PostDetail);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function load(fixture: { detectChanges(): void }) {
    expectApi(http, '/posts/p1').flush(post());
    expectApi(http, '/posts/p1/comments').flush({
      comments: [comment('c2'), comment('c1')],
      nextCursor: null,
    });
    fixture.detectChanges();
  }

  it('renders the post with linkified content and oldest-first comments', () => {
    const { fixture, el } = create();
    load(fixture);
    expect(el.querySelector('fc-post-card')).not.toBeNull();
    const link = el.querySelector('.content a');
    expect(link?.getAttribute('href')).toBe('https://example.com');
    const bodies = Array.from(el.querySelectorAll('.comment')).map((c) => c.textContent);
    expect(bodies[0]).toContain('comment c1');
    expect(bodies[1]).toContain('comment c2');
  });

  it('shows the not-found state for a gone post', () => {
    const { fixture, el } = create();
    expectApi(http, '/posts/p1').flush([{ code: 'Post.NotFound', description: 'Gone.' }], {
      status: 404,
      statusText: 'Not Found',
    });
    fixture.detectChanges();
    expect(el.textContent).toContain('Post not found');
  });

  it('adds a comment from the POST response without refetching', () => {
    const { fixture, el } = create();
    load(fixture);

    // Scope to the comment form: PostCard embeds a closed report dialog whose own
    // textarea + submit would match bare selectors first (same trap as .fc-primary).
    const box = el.querySelector(
      'form[aria-label="Add a comment"] textarea',
    ) as HTMLTextAreaElement;
    box.value = 'nice post';
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    // Scope to the comment form: PostCard's closed report dialog also contains
    // an (inert, disabled) .fc-primary that a bare querySelector would hit first.
    el.querySelector<HTMLButtonElement>('form[aria-label="Add a comment"] .fc-primary')!.click();

    const req = expectApi(http, '/posts/p1/comments');
    expect(req.request.body).toEqual({ content: 'nice post' });
    req.flush({ ...comment('c3', 'me', 'alice'), content: 'nice post' });
    fixture.detectChanges();

    expect(el.textContent).toContain('nice post');
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('deletes an own comment inline', () => {
    const { fixture, el } = create();
    expectApi(http, '/posts/p1').flush(post());
    expectApi(http, '/posts/p1/comments').flush({
      comments: [comment('c2'), comment('c1', 'me', 'alice')],
      nextCursor: null,
    });
    fixture.detectChanges();

    const mine = Array.from(el.querySelectorAll('.comment')).find((c) =>
      c.textContent?.includes('comment c1'),
    )!;
    mine.querySelector<HTMLButtonElement>('.danger-ghost')!.click();
    expectApi(http, '/comments/c1').flush(null);
    fixture.detectChanges();

    expect(el.textContent).not.toContain('comment c1');
    expect(el.textContent).toContain('comment c2');
  });
});
