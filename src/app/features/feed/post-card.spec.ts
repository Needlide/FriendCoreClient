import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Post } from '../../core/models/posts.models';
import { PreferencesService } from '../../core/preferences/preferences.service';
import { MediaViewer } from './media-viewer';
import { PostCard } from './post-card';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const base: Post = {
  id: 'p1',
  authorId: 'a1',
  authorUsername: 'bob',
  authorDisplayName: 'Bob',
  content: 'hello',
  sensitivity: 'General',
  likeCount: 4,
  commentCount: 2,
  isLikedByCurrentUser: false,
  createdAt: new Date().toISOString(),
  media: [],
  tags: [{ name: 'synths', slug: 'synths' }],
};

describe('PostCard', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([PostCard]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create(post: Post = base) {
    const fixture = TestBed.createComponent(PostCard);
    fixture.componentRef.setInput('post', post);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders author, content, tags, and counts', () => {
    const { el } = create();
    expect(el.textContent).toContain('Bob');
    expect(el.textContent).toContain('@bob');
    expect(el.textContent).toContain('hello');
    expect(el.textContent).toContain('#synths');
    expect(el.querySelector('.like')?.textContent).toContain('4');
  });

  it('flips the like optimistically and keeps it on success', () => {
    const { fixture, el } = create();
    el.querySelector<HTMLButtonElement>('.like')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.like')?.textContent).toContain('5');
    expectApi(http, '/posts/p1/like').flush(null);
    fixture.detectChanges();
    expect(el.querySelector('.like')?.textContent).toContain('5');
  });

  it('rolls the like back when the server rejects it', () => {
    const { fixture, el } = create();
    el.querySelector<HTMLButtonElement>('.like')!.click();
    expectApi(http, '/posts/p1/like').flush(null, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('.like')?.textContent).toContain('4');
    expect(el.querySelector('.like')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('never loads flagged media before consent', () => {
    const { fixture, el } = create({
      ...base,
      media: [
        {
          id: 'm1',
          hasFlashingWarning: true,
          hasIntenseMotionWarning: false,
          variants: [{ type: 'Medium', url: 'https://cdn/x.webp', widthPx: 800, heightPx: 600 }],
        },
      ],
    });
    // Placeholder only: no <img>, so the browser fetches nothing.
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('Sensitive media');
    el.querySelector<HTMLButtonElement>('.placeholder button')!.click();
    fixture.detectChanges();
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://cdn/x.webp');
  });
});

describe('MediaViewer', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([MediaViewer]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const flagged = {
    id: 'm1',
    hasFlashingWarning: true,
    hasIntenseMotionWarning: false,
    variants: [{ type: 'Medium', url: 'https://cdn/y.webp', widthPx: 800, heightPx: 600 }],
  };

  it('renders safe media directly', () => {
    const fixture = TestBed.createComponent(MediaViewer);
    fixture.componentRef.setInput('media', { ...flagged, hasFlashingWarning: false });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://cdn/y.webp');
  });

  it('loads flagged media directly once the preference is off', () => {
    // Flip the real preference through the service (PATCH echo), then render.
    TestBed.inject(PreferencesService)
      .update({
        hideFlashingMedia: false,
        reduceMotion: false,
        disableAutoplay: true,
        reduceVisualNoise: false,
        contentPreference: 'General',
      })
      .subscribe();
    const patch = expectApi(http, '/users/me/preferences');
    expect(patch.request.method).toBe('PATCH');
    patch.flush({
      hideFlashingMedia: false,
      reduceMotion: false,
      disableAutoplay: true,
      reduceVisualNoise: false,
      contentPreference: 'General',
    });

    const fixture = TestBed.createComponent(MediaViewer);
    fixture.componentRef.setInput('media', flagged);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://cdn/y.webp');
  });
});
