import { TestBed } from '@angular/core/testing';
import { PostMedia } from '../../core/models/posts.models';
import { MediaViewer } from './media-viewer';

/**
 * Two sizes out of one response, and the consent rule that must hold for BOTH of them.
 */
describe('MediaViewer', () => {
  const flagged: PostMedia = {
    id: 'm1',
    hasFlashingWarning: true,
    hasIntenseMotionWarning: false,
    variants: [
      { type: 'Thumbnail', url: 'https://cdn/thumb.webp', widthPx: 100, heightPx: 100 },
      { type: 'Small', url: 'https://cdn/small.webp', widthPx: 300, heightPx: 200 },
      { type: 'Medium', url: 'https://cdn/medium.webp', widthPx: 800, heightPx: 533 },
      { type: 'Large', url: 'https://cdn/large.webp', widthPx: 1400, heightPx: 933 },
    ],
  };

  const plain: PostMedia = { ...flagged, hasFlashingWarning: false };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [MediaViewer] });
  });

  function show(media: PostMedia, compact = false) {
    const fixture = TestBed.createComponent(MediaViewer);
    fixture.componentRef.setInput('media', media);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
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
   * makes the browser FETCH the bytes. Flagged media must have no src anywhere in the
   * component until the user consents.
   */
  it('puts no image src anywhere in the DOM before consent', () => {
    const { el } = show(flagged);
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('dialog')).toBeNull();
  });

  it('shows flagged media only after consent, then offers the full size', () => {
    const { fixture, el } = show(flagged);

    el.querySelector<HTMLButtonElement>('.placeholder button')!.click();
    fixture.detectChanges();

    expect(el.querySelector('.viewer img')?.getAttribute('src')).toBe('https://cdn/medium.webp');

    // The dialog is created by the same @if as the consent reveal, so re-query it.
    const dialog = el.querySelector<HTMLDialogElement>('dialog')!;
    dialog.showModal = () => dialog.setAttribute('open', '');

    el.querySelector<HTMLButtonElement>('.zoom')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.lightbox img')?.getAttribute('src')).toBe('https://cdn/large.webp');
  });

  it('falls back through the chain when the variant set is partial', () => {
    const onlyLarge: PostMedia = {
      ...plain,
      variants: [{ type: 'Large', url: 'https://cdn/large.webp', widthPx: 1400, heightPx: 933 }],
    };
    const { el } = show(onlyLarge);
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://cdn/large.webp');
  });

  it('renders no src at all when there are no variants', () => {
    const empty: PostMedia = { ...plain, variants: [] };
    const { el } = show(empty);
    expect(el.querySelector('img')?.getAttribute('src')).toBe('');
  });
});
