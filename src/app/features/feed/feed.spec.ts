import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Post } from '../../core/models/posts.models';
import { Feed } from './feed';
import { PostCard } from './post-card';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

function post(id: string, overrides: Partial<Post> = {}): Post {
  return {
    id,
    authorId: 'author1',
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
    ...overrides,
  };
}

describe('Feed', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([Feed]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Feed);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders the first page and the end state when the cursor is null', () => {
    const { fixture, el } = create();
    expectApi(http, '/feed/home').flush({ posts: [post('1'), post('2')], nextCursor: null });
    fixture.detectChanges();
    expect(el.querySelectorAll('fc-post-card').length).toBe(2);
    expect(el.textContent).toContain("You're all caught up.");
  });

  it('has exactly one h1 (screen-reader page title)', () => {
    const { fixture, el } = create();
    expectApi(http, '/feed/home').flush({ posts: [], nextCursor: null });
    fixture.detectChanges();
    expect(el.querySelectorAll('h1').length).toBe(1);
  });

  it('appends page 2 on Load more without refetching page 1', () => {
    const { fixture, el } = create();
    expectApi(http, '/feed/home').flush({ posts: [post('1')], nextCursor: 'cursor1' });
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('.load-more')!.click();
    const page2 = expectApi(http, '/feed/home');
    expect(page2.request.params.get('cursor')).toBe('cursor1');
    page2.flush({ posts: [post('2')], nextCursor: null });
    fixture.detectChanges();

    expect(el.querySelectorAll('fc-post-card').length).toBe(2);
  });

  it('shows the empty state with an onboarding CTA when following nobody', () => {
    const { fixture, el } = create();
    expectApi(http, '/feed/home').flush({ posts: [], nextCursor: null });
    fixture.detectChanges();
    expect(el.textContent).toContain('Your feed is empty');
    expect(el.querySelector('a[href="/onboarding"]')).not.toBeNull();
  });

  it('prepends a published post and drops a deleted one without refetching', () => {
    const { fixture, el } = create();
    expectApi(http, '/feed/home').flush({ posts: [post('1')], nextCursor: null });
    fixture.detectChanges();

    const feed = fixture.componentInstance;
    feed.prepend(post('fresh'));
    fixture.detectChanges();
    expect(el.querySelectorAll('fc-post-card').length).toBe(2);

    // Simulate the card's delete event (card-level delete is covered in post-card.spec).
    fixture.debugElement.query(By.directive(PostCard)).componentInstance.deleted.emit('fresh');
    fixture.detectChanges();
    expect(el.querySelectorAll('fc-post-card').length).toBe(1);
    http.expectNone((req) => req.url.endsWith('/feed/home'));
  });
});
