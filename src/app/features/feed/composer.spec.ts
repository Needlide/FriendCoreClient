import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
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

  beforeEach(async () => {
    vi.useFakeTimers();
    await configureAuthTestBed([Composer]);
    http = TestBed.inject(HttpTestingController);
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

  it('resends the verification email from the gate', () => {
    const { fixture, el } = create();
    writeText(el, 'hello');
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.fc-submit')!.click();
    expectApi(http, '/posts').flush(
      [{ code: 'User.EmailNotVerified', description: 'Verify first.' }],
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('.gate button')!.click();
    expectApi(http, '/auth/resend-verification').flush(null);
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
    vi.advanceTimersByTime(1500);
    expectApi(http, '/media/m1/status').flush({ id: 'm1', status: 'Ready' });
    fixture.detectChanges();

    expect(el.textContent).toContain('Image attached');
    el.querySelector<HTMLButtonElement>('.fc-submit')!.click();
    const req = expectApi(http, '/posts');
    expect(req.request.body).toMatchObject({ mediaIds: ['m1'] });
    req.flush(createdPost);
  });
});
