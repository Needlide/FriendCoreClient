import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Preferences } from './preferences';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const serverPrefs = {
  hideFlashingMedia: true,
  hideArachnidMedia: true,
  reduceMotion: false,
  disableAutoplay: true,
  reduceVisualNoise: false,
  contentPreference: 'General',
  sendMessageOnEnter: true,
};

describe('Preferences page', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([Preferences]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Preferences);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  /**
   * Finds a toggle by the bold label beside it. Deliberately not a positional index: adding a
   * checkbox above another silently repoints every `boxes[n]` in this suite, and the test then
   * clicks one toggle while asserting another — which passes, because both are checkboxes.
   */
  function toggle(el: HTMLElement, label: string): HTMLInputElement {
    const row = Array.from(el.querySelectorAll('label')).find((candidate) =>
      candidate.querySelector('strong')?.textContent?.trim().includes(label),
    );
    const input = row?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!input) throw new Error(`No checkbox labelled "${label}"`);
    return input;
  }

  it('loads toggles from the server and saves the whole set', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/preferences').flush(serverPrefs);
    fixture.detectChanges();

    // Flip one toggle and save — the PATCH carries every field, not just the delta.
    toggle(el, 'Reduce motion').click();
    el.querySelector<HTMLButtonElement>('.fc-primary')!.click();

    const req = expectApi(http, '/users/me/preferences');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toMatchObject({ reduceMotion: true, hideFlashingMedia: true });
    req.flush({ ...serverPrefs, reduceMotion: true });
    fixture.detectChanges();
    expect(el.textContent).toContain('Saved.');
  });

  it('saves the arachnophobia warning toggle as part of the whole set', async () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/preferences').flush(serverPrefs);
    fixture.detectChanges();
    await fixture.whenStable();

    toggle(el, 'Hide spiders and arachnids').click();
    el.querySelector<HTMLButtonElement>('.fc-primary')!.click();

    const req = expectApi(http, '/users/me/preferences');
    expect(req.request.body).toMatchObject({ hideArachnidMedia: false, hideFlashingMedia: true });
    req.flush({ ...serverPrefs, hideArachnidMedia: false });
    fixture.detectChanges();
    expect(el.textContent).toContain('Saved.');
  });

  it('shows the send-key toggle in its own group, not among the accessibility ones', async () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/preferences').flush(serverPrefs);
    fixture.detectChanges();

    // It is not an accessibility setting, so it must not sit inside a group claiming to be
    // one — the label on that group is a promise to screen-reader users.
    const groups = Array.from(el.querySelectorAll('[role="group"]'));
    const labels = groups.map((g) => g.getAttribute('aria-label'));
    expect(labels).toContain('Accessibility toggles');
    expect(labels).toContain('Chat composer');

    const composer = groups.find((g) => g.getAttribute('aria-label') === 'Chat composer')!;
    expect(composer.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
    // NgModel writes to the input on a microtask, so the DOM only reflects the loaded value
    // once the view has settled. Asserted for the first time here; the other rows were only
    // ever read back off the component signal, which is why this was never noticed.
    await fixture.whenStable();
    expect(toggle(el, 'Send with Enter').checked).toBe(true);
  });

  it('explains both directions of the toggle', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/preferences').flush(serverPrefs);
    fixture.detectChanges();

    const copy = el.textContent ?? '';
    expect(copy).toContain('Shift+Enter');
    // Both modifier names: Ctrl+Enter is what a Windows/Linux user reaches for and Cmd+Enter
    // is what the key under their spacebar actually is.
    expect(copy).toContain('Ctrl+Enter');
    expect(copy).toContain('Cmd+Enter');
  });

  it('loads a user who prefers Ctrl+Enter to send', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/preferences').flush({ ...serverPrefs, sendMessageOnEnter: false });
    fixture.detectChanges();

    expect(toggle(el, 'Send with Enter').checked).toBe(false);
  });

  it('saves the send-key preference as part of the whole set', async () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/preferences').flush(serverPrefs);
    fixture.detectChanges();
    // Settle first: until NgModel has written `true` into the input, a click would take the
    // box from false to true and write back the value it already had — a silent no-op that
    // looks exactly like "the setting does not save".
    await fixture.whenStable();

    toggle(el, 'Send with Enter').click();
    el.querySelector<HTMLButtonElement>('.fc-primary')!.click();

    const req = expectApi(http, '/users/me/preferences');
    // Full replace, so the flipped field rides along with the untouched ones rather than
    // being silently dropped — a dropped bool here would arrive server-side as false and
    // quietly undo what the user just asked for.
    expect(req.request.body).toMatchObject({ sendMessageOnEnter: false, reduceMotion: false });
    req.flush({ ...serverPrefs, sendMessageOnEnter: false });
    fixture.detectChanges();
    expect(el.textContent).toContain('Saved.');
  });
});
