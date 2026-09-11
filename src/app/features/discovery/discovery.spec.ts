import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Discovery } from './discovery';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const peopleResponse = {
  people: [{ id: '1', username: 'bob', displayName: 'Bob', bio: 'synth nerd', matchScore: 20 }],
};

const postsResponse = {
  posts: [
    {
      id: 'p1',
      authorId: 'a1',
      authorUsername: 'bob',
      authorDisplayName: 'Bob',
      content: 'matching post',
      sensitivity: 'General',
      likeCount: 0,
      commentCount: 0,
      isLikedByCurrentUser: false,
      createdAt: new Date().toISOString(),
      media: [],
      tags: [],
    },
  ],
};

describe('Discovery', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([Discovery]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Discovery);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function switchToPosts(el: HTMLElement) {
    const tabs = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    tabs.find((t) => t.textContent?.trim() === 'Posts')!.click();
  }

  it('loads people by default and renders user cards', () => {
    const { fixture, el } = create();
    expectApi(http, '/feed/discovery/people').flush(peopleResponse);
    fixture.detectChanges();
    expect(el.querySelectorAll('fc-user-card').length).toBe(1);
    expect(el.textContent).toContain('@bob');
  });

  it('fetches posts only when the Posts tab opens (lazy per tab)', () => {
    const { fixture, el } = create();
    expectApi(http, '/feed/discovery/people').flush(peopleResponse);
    fixture.detectChanges();

    switchToPosts(el);
    fixture.detectChanges();
    expectApi(http, '/feed/discovery/posts').flush(postsResponse);
    fixture.detectChanges();

    expect(el.querySelectorAll('fc-post-card').length).toBe(1);
    expect(el.textContent).toContain('matching post');
  });

  it('removes the row after a confirmed block', () => {
    const { fixture, el } = create();
    expectApi(http, '/feed/discovery/people').flush(peopleResponse);
    fixture.detectChanges();
    expect(el.querySelectorAll('fc-user-card').length).toBe(1);

    // Open the row's menu and block (no follow relationship → immediate 204).
    el.querySelector('fc-block-mute-menu summary')!.dispatchEvent(new Event('click'));
    const blockItem = Array.from(el.querySelectorAll('fc-block-mute-menu .items button')).find(
      (b) => b.textContent?.includes('Block'),
    ) as HTMLButtonElement;
    blockItem.click();
    expectApi(http, '/users/bob/block').flush(null);
    fixture.detectChanges();

    expect(el.querySelectorAll('fc-user-card').length).toBe(0);
  });

  it('shows an empty state when nothing matches', () => {
    const { fixture, el } = create();
    expectApi(http, '/feed/discovery/people').flush({ people: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing new to discover');
  });
});
