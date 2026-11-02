import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Composer } from './composer';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

describe('Composer', () => {
  let http: HttpTestingController;

  const createdPost = {
    id: 'new1',
    authorId: 'me',
    authorUsername: 'alice',
    authorDisplayName: 'Alice',
    content: 'first!',
    sensitivity: 'General',
    likeCount: 0,
    commentCount: 0,
    isLikedByCurrentUser: false,
    createdAt: new Date().toISOString(),
    media: [],
    tags: [],
  };

  const verifiedSession = {
    accessToken: 'token',
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    userId: 'me',
    username: 'alice',
    displayName: 'Alice',
    isEmailVerified: true,
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    await configureAuthTestBed([Composer]);
    http = TestBed.inject(HttpTestingController);
    // Most tests act as a verified user; the gate tests below sign in unverified.
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(verifiedSession);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function create() {
    const fixture = TestBed.createComponent(Composer);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function writeText(el: HTMLElement, text: string) {
    const area = el.querySelector('textarea')!;
    area.value = text;
    area.dispatchEvent(new Event('input'));
  }

  it('publishes text and emits the created post', () => {
    const { fixture, el } = create();
    const emitted: unknown[] = [];
    fixture.componentInstance.postCreated.subscribe((p) => emitted.push(p));
    writeText(el, 'first!');
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.fc-submit')!.click();

    const req = expectApi(http, '/posts');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toMatchObject({ content: 'first!', sensitivity: 'General' });
    req.flush(createdPost);
    fixture.detectChanges();

    expect(emitted.length).toBe(1);
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
  });

  it('shows the verify gate (not a dead error) on User.EmailNotVerified', () => {
    const { fixture, el } = create();
    writeText(el, 'hello');
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.fc-submit')!.click();

    expectApi(http, '/posts').flush(
      [{ code: 'User.EmailNotVerified', description: 'Verify first.' }],
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(el.textContent).toContain('Verify your email before posting.');
  });

  it('resends verification to a typed-in email (none is stored)', () => {
    const { fixture, el } = create();
    writeText(el, 'hello');
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.fc-submit')!.click();
    expectApi(http, '/posts').flush(
      [{ code: 'User.EmailNotVerified', description: 'Verify first.' }],
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    const emailInput = el.querySelector('#composer-resend-email') as HTMLInputElement;
    emailInput.value = 'alice@example.com';
    emailInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.gate button')!.click();
    const req = expectApi(http, '/auth/resend-verification');
    expect(req.request.body).toEqual({ email: 'alice@example.com' });
    req.flush(null);
    fixture.detectChanges();
    expect(el.textContent).toContain('check your inbox');
  });

  it('blocks publish while media is still processing', () => {
    const { fixture, el } = create();
    writeText(el, 'with image');
    fixture.detectChanges();

    // Simulate an in-flight attachment by driving the file input with a fake file.
    const file = new File(['x'], 'pic.png', { type: 'image/png' });
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    // jsdom file inputs: define files directly, then fire change.
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // Upload request is in flight — publish must stay disabled even with text.
    expect(el.querySelector<HTMLButtonElement>('.fc-submit')!.disabled).toBe(true);
    expectApi(http, '/media'); // let it hang: the point is publish stays gated
  });

  it('shows the verify notice upfront and blocks publishing while unverified', () => {
    TestBed.inject(AuthService).clearSession();
    const { fixture, el } = create();
    writeText(el, 'my draft');
    fixture.detectChanges();

    expect(el.textContent).toContain('Verify your email to post.');
    expect(el.querySelector<HTMLButtonElement>('.fc-submit')!.disabled).toBe(true);
    // The draft survives — the gate never wipes typed work.
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('my draft');
  });

  it('recheck flips the gate after verifying elsewhere, draft intact', () => {
    TestBed.inject(AuthService).clearSession();
    const { fixture, el } = create();
    writeText(el, 'my draft');
    fixture.detectChanges();

    const check = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('check again'),
    ) as HTMLButtonElement;
    check.click();
    expectApi(http, '/auth/refresh').flush(verifiedSession);
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Verify your email to post.');
    expect(el.querySelector<HTMLButtonElement>('.fc-submit')!.disabled).toBe(false);
    expect((el.querySelector('textarea') as HTMLTextAreaElement).value).toBe('my draft');
  });

  it('recheck ignores hammering: one request per 5s cooldown', () => {
    TestBed.inject(AuthService).clearSession();
    const { fixture, el } = create();
    fixture.detectChanges();

    const check = () =>
      Array.from(el.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('check again'),
      ) as HTMLButtonElement;
    check().click();
    expectApi(http, '/auth/refresh').flush({ ...verifiedSession, isEmailVerified: false });
    fixture.detectChanges();

    // Still unverified — and the button is cooling down, so a second click sends nothing.
    expect(el.textContent).toContain('Still unverified');
    check().click();
    http.expectNone((req) => req.url.endsWith('/auth/refresh'));

    vi.advanceTimersByTime(5000);
    fixture.detectChanges();
    check().click();
    expectApi(http, '/auth/refresh').flush(verifiedSession);
  });

  it('polls the status endpoint until Ready, then attaches the id', () => {
    const { fixture, el } = create();
    writeText(el, 'with image');
    fixture.detectChanges();

    const file = new File(['x'.repeat(10)], 'pic.png', { type: 'image/png' });
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));

    // Upload responds immediately…
    expectApi(http, '/media').flush({ id: 'm1', status: 'Processing' });
    // …then polling starts. timer(0, …) still needs a tick for its first emission…
    vi.advanceTimersByTime(0);
    expectApi(http, '/media/m1/status').flush({ id: 'm1', status: 'Processing' });
    fixture.detectChanges();
    // Intermediate Processing polls must NOT surface as failure — the terminal
    // states (Ready/Failed) are the only ones the subscriber ever sees.
    expect(el.querySelector('.failed')).toBeNull();
    expect(el.textContent).toContain('Processing image');
    vi.advanceTimersByTime(1500);
    expectApi(http, '/media/m1/status').flush({ id: 'm1', status: 'Ready' });
    fixture.detectChanges();

    expect(el.textContent).toContain('Image attached');
    el.querySelector<HTMLButtonElement>('.fc-submit')!.click();
    const req = expectApi(http, '/posts');
    expect(req.request.body).toMatchObject({ mediaIds: ['m1'] });
    req.flush(createdPost);
  });

  it('shows a content settings button instead of an inline checkbox', () => {
    const { el } = create();
    const btn = el.querySelector('.fc-content-settings-btn');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('Content settings');

    // No inline checkbox anymore — the toggles live in the dialog.
    expect(el.querySelector('.checks input[type=checkbox]')).toBeNull();
  });

  it('opens the content settings dialog and shows all three toggles', () => {
    // jsdom implements <dialog> markup but not showModal() — stub it.
    window.HTMLDialogElement.prototype.showModal ??= function (
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    };
    window.HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    const { fixture, el } = create();
    const btn = el.querySelector('.fc-content-settings-btn') as HTMLButtonElement;
    btn.click();
    fixture.detectChanges();

    const dialog = el.querySelector('fc-content-settings dialog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);

    // All three toggles are present in the drawer.
    const boxes = Array.from(dialog.querySelectorAll('input[type=checkbox]'));
    expect(boxes.length).toBe(3);
    expect(dialog.textContent).toContain('Flashing lights or intense motion');
    expect(dialog.textContent).toContain('Spiders or arachnids');
    expect(dialog.textContent).toContain('Explicit or sexually suggestive content');

    dialog.close();
    fixture.detectChanges();
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('sends all hazard fields from the content settings dialog', () => {
    const { fixture, el } = create();
    writeText(el, 'with flags');
    fixture.detectChanges();

    // Set all three flags directly (as the dialog would).
    const comp = fixture.componentInstance;
    comp.warnSafety.set(true);
    comp.warnArachnophobia.set(true);
    comp.warnExplicit.set(true);
    fixture.detectChanges();

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const input = el.querySelector<HTMLInputElement>('#composer-file')!;
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    // Multipart, but the flags travel as ONE JSON dictionary field — adding a new hazard
    // never changes the form or the API contract.
    const upload = expectApi(http, '/media');
    const form = upload.request.body as FormData;
    expect(form.get('SafetyFlags')).toBe(
      JSON.stringify({
        flashing: true,
        intenseMotion: true,
        arachnophobia: true,
        explicit: true,
      }),
    );
  });
});
