import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ReportDialog } from './report-dialog';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

describe('ReportDialog', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // jsdom implements <dialog> markup but not showModal() — stub the one method
    // the component needs (content renders regardless; `open` only affects display).
    window.HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    window.HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    await configureAuthTestBed([ReportDialog]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(ReportDialog);
    fixture.componentRef.setInput('target', { kind: 'post', id: 'p1' });
    fixture.detectChanges();
    fixture.componentInstance.open();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('requires a category before sending', () => {
    const { el } = create();
    expect(el.querySelector<HTMLButtonElement>('.actions .fc-primary')!.disabled).toBe(true);
  });

  it('posts the category plus note and thanks the reporter', () => {
    vi.useFakeTimers();
    try {
      const { fixture, el } = create();
      const spam = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(
        (r) => r.value === 'Spam',
      )!;
      spam.click();
      const note = el.querySelector('textarea')!;
      note.value = 'Posted the same link five times.';
      note.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      el.querySelector<HTMLButtonElement>('.actions .fc-primary')!.click();
      const req = expectApi(http, '/posts/p1/report');
      expect(req.request.body).toEqual({
        category: 'Spam',
        note: 'Posted the same link five times.',
      });
      req.flush(null);
      fixture.detectChanges();
      expect(el.textContent).toContain("Thanks — we'll review this.");
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays open after reporting until dismissed, rather than closing on a timer', () => {
    // The old behaviour closed on a 1.2s timer. Reported as unreadable, and a
    // confirmation that vanishes by itself is what assistive tech misses entirely.
    vi.useFakeTimers();
    try {
      const { fixture, el } = create();
      const spam = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(
        (r) => r.value === 'Spam',
      )!;
      spam.click();
      fixture.detectChanges();

      el.querySelector<HTMLButtonElement>('.actions .fc-primary')!.click();
      expectApi(http, '/posts/p1/report').flush(null);
      fixture.detectChanges();

      const dialog = el.querySelector('dialog')!;
      expect(dialog.open).toBe(true);
      expect(el.textContent).toContain('Thanks');

      // Time passing must not close it.
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(dialog.open).toBe(true);

      const close = Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
        (b.textContent ?? '').includes('Close'),
      )!;
      close.click();
      fixture.detectChanges();
      expect(dialog.open).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports a user against the user endpoint', () => {
    const fixture = TestBed.createComponent(ReportDialog);
    fixture.componentRef.setInput('target', { kind: 'user', username: 'bob' });
    fixture.detectChanges();
    fixture.componentInstance.open();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Report @bob');
    const other = Array.from(el.querySelectorAll<HTMLInputElement>('input[type="radio"]')).find(
      (r) => r.value === 'Other',
    )!;
    other.click();
    // jsdom doesn't reliably fire change on radio.click() — say it explicitly.
    other.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('.actions .fc-primary')!.click();
    const req = expectApi(http, '/users/bob/report');
    expect(req.request.body).toEqual({ category: 'Other', note: null });
    req.flush(null);
  });
});
