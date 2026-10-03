import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PostMedia } from '../../core/models/posts.models';
import { PreferencesService } from '../../core/preferences/preferences.service';
import { MediaViewer } from './media-viewer';

/**
 * Two sizes out of one response, and the consent rule that must hold for BOTH of them.
 *
 * The gate is SERVER-side now: flagged media arrives with an empty `variants` array, and the
 * URLs only exist after POST /media/{id}/reveal comes back authorized. So "flagged" in these
 * fixtures means `variants: []`, not a boolean the component reads — the component cannot see
 * a URL it was never given, which is the whole point.
 */
describe('MediaViewer', () => {
  const variants = [
    { type: 'Thumbnail', url: 'https://cdn/thumb.webp', widthPx: 100, heightPx: 100 },
    { type: 'Small', url: 'https://cdn/small.webp', widthPx: 300, heightPx: 200 },
    { type: 'Medium', url: 'https://cdn/medium.webp', widthPx: 800, heightPx: 533 },
    { type: 'Large', url: 'https://cdn/large.webp', widthPx: 1400, heightPx: 933 },
  ];

  const plain: PostMedia = {
    id: 'm1',
    hasFlashingWarning: false,
    hasIntenseMotionWarning: false,
    variants,
  };

  /** What the API now returns for flagged media: the flags, and no locations at all. */
  const gated: PostMedia = {
    id: 'm1',
    hasFlashingWarning: true,
    hasIntenseMotionWarning: false,
    variants: [],
  };

  let http: HttpTestingController;
  let hideFlashing = true;

  beforeEach(() => {
    hideFlashing = true;
    TestBed.configureTestingModule({
      imports: [MediaViewer],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    // The component auto-consents for a reader who has opted OUT, so the preference has to be
    // controllable per test.
    TestBed.overrideProvider(PreferencesService, {
      useValue: { hideFlashingMedia: () => hideFlashing },
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function show(media: PostMedia, compact = false) {
    const fixture = TestBed.createComponent(MediaViewer);
    fixture.componentRef.setInput('media', media);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /** Flushing the auto-reveal effect's request, for the opted-out path. */
  function flushReveal(vars = variants) {
    const req = http.expectOne((r) => r.url.endsWith('/api/v1/media/m1/reveal'));
    expect(req.request.method).toBe('POST');
    req.flush({ mediaId: 'm1', variants: vars });
  }

  it('inline source is Medium in a feed card and Small in a bubble', () => {
    const feed = show(plain);
    expect(feed.el.querySelector('img')?.getAttribute('src')).toBe('https://cdn/medium.webp');

    const bubble = show(plain, true);
    expect(bubble.el.querySelector('img')?.getAttribute('src')).toBe('https://cdn/small.webp');
  });

  it('opens the Large variant in a dialog on click', () => {
    const { fixture, el } = show(plain);
    const dialog = el.querySelector<HTMLDialogElement>('dialog')!;

    expect(el.querySelector('.zoom')?.getAttribute('aria-label')).toBe('View image at full size');
    dialog.showModal = () => dialog.setAttribute('open', '');

    el.querySelector<HTMLButtonElement>('.zoom')!.click();
    fixture.detectChanges();

    expect(dialog.hasAttribute('open')).toBe(true);
    expect(el.querySelector('.lightbox img')?.getAttribute('src')).toBe('https://cdn/large.webp');
  });

  it('makes the zoom affordance keyboard reachable (it is a real button)', () => {
    const { el } = show(plain);
    const zoom = el.querySelector('.zoom')!;
    expect(zoom.tagName).toBe('BUTTON');
    expect(zoom.getAttribute('type')).toBe('button');
  });

  /**
   * The regression this file exists for: a hidden <img src> inside a closed dialog still
   * makes the browser FETCH the bytes. Gated media has no src anywhere until the server issues
   * one — and the component cannot invent one, because none arrived.
   */
  it('puts no image src anywhere in the DOM before consent', () => {
    const { el } = show(gated);
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('dialog')).toBeNull();
    // And nothing was even asked for: consent is the user's to give.
    http.expectNone((r) => r.url.includes('/reveal'));
  });

  it('asks the server for consent, then renders the granted URLs', () => {
    const { fixture, el } = show(gated);
    expect(el.querySelector('.placeholder')?.textContent).toContain('Sensitive media');

    el.querySelector<HTMLButtonElement>('.placeholder button')!.click();
    fixture.detectChanges();
    flushReveal();
    fixture.detectChanges();

    expect(el.querySelector('.viewer img')?.getAttribute('src')).toBe('https://cdn/medium.webp');

    const dialog = el.querySelector<HTMLDialogElement>('dialog')!;
    dialog.showModal = () => dialog.setAttribute('open', '');
    el.querySelector<HTMLButtonElement>('.zoom')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.lightbox img')?.getAttribute('src')).toBe('https://cdn/large.webp');
  });

  it('auto-consents for a reader who turned the protection off, without asking twice', () => {
    hideFlashing = false;
    const { fixture } = show(gated);

    // They already decided in Settings; re-asking per image would nag. The request still goes
    // to the server, so this is not the client choosing to serve a hazard.
    flushReveal();
    fixture.detectChanges();
    http.expectNone((r) => r.url.includes('/reveal'));
  });

  it('says so when the server refuses, instead of spinning forever', () => {
    const { fixture, el } = show(gated);
    el.querySelector<HTMLButtonElement>('.placeholder button')!.click();
    fixture.detectChanges();

    const req = http.expectOne((r) => r.url.endsWith('/api/v1/media/m1/reveal'));
    req.flush({ errors: { code: ['Media.NotFound'] } }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(el.querySelector('.placeholder')?.textContent).toContain('Media unavailable');
    // A refusal must not be retryable into a request storm, and must not show the image.
    el.querySelector<HTMLButtonElement>('.placeholder button')?.click();
    fixture.detectChanges();
    http.expectNone((r) => r.url.includes('/reveal'));
    expect(el.querySelector('img')).toBeNull();
  });

  it('never renders a src it was not given, even if consent returns nothing', () => {
    const { fixture, el } = show(gated);
    el.querySelector<HTMLButtonElement>('.placeholder button')!.click();
    fixture.detectChanges();
    flushReveal([]);

    // An authorized-but-empty grant renders no image rather than a broken one.
    expect(el.querySelector('img')?.getAttribute('src') ?? '').toBe('');
  });

  it('falls back through the chain when the variant set is partial', () => {
    const onlyLarge: PostMedia = {
      ...plain,
      variants: [{ type: 'Large', url: 'https://cdn/large.webp', widthPx: 1400, heightPx: 933 }],
    };
    const { el } = show(onlyLarge);
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://cdn/large.webp');
  });

  it('asks for consent for any media with no URLs, whatever the flags say', () => {
    // The component keys off the absence of data, not the boolean — so a client cannot talk
    // its way past the gate by ignoring the flags.
    const { el } = show({ ...plain, variants: [] });
    expect(el.querySelector('.placeholder')).not.toBeNull();
    expect(el.querySelector('img')).toBeNull();
  });
});
