import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TagInput } from './tag-input';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

/**
 * The pipeline under test: keystroke → 250 ms pause → one GET → rendered listbox.
 * Fake timers control the debounce; HttpTestingController observes the network.
 */
describe('TagInput', () => {
  let http: HttpTestingController;

  const response = {
    query: 'syn',
    suggestions: [
      { id: '1', name: 'synths', slug: 'synths', totalCount: 12 },
      { id: '2', name: 'synthwave', slug: 'synthwave', totalCount: 3 },
    ],
    hasExactMatch: false,
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    await configureAuthTestBed([TagInput]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  function type(text: string) {
    const fixture = TestBed.createComponent(TagInput);
    fixture.componentRef.setInput('label', 'Interests');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    return { fixture, el, input };
  }

  it('fetches once after the user pauses and renders suggestions + first-use row', () => {
    const { fixture, el } = type('syn');
    vi.advanceTimersByTime(250);
    const req = expectApi(http, '/tags/autocomplete');
    expect(req.request.params.get('q')).toBe('syn');
    req.flush(response);
    fixture.detectChanges();

    const options = el.querySelectorAll('[role="option"]');
    expect(options.length).toBe(3); // 2 suggestions + "you're the first"
    expect(el.textContent).toContain("you're the first");
  });

  it('sends nothing for queries shorter than 2 characters', () => {
    type('s');
    vi.advanceTimersByTime(1000);
    http.expectNone((req) => req.url.endsWith('/tags/autocomplete'));
  });

  it('emits free text on Enter and clears the input', () => {
    const { fixture, el } = type('dreampop');
    const emitted: string[] = [];
    fixture.componentInstance.tagAdd.subscribe((name) => emitted.push(name));
    // No pause yet — Enter on a closed list submits the text directly.
    el.querySelector('input')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(emitted).toEqual(['dreampop']);
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('');
    http.expectNone((req) => req.url.endsWith('/tags/autocomplete'));
  });

  it('keeps typing usable when the server errors', () => {
    const { fixture, el } = type('syn');
    vi.advanceTimersByTime(250);
    expectApi(http, '/tags/autocomplete').flush(null, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    // No listbox, no crash — the input still holds the text for free-text submit.
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('syn');
  });
});
