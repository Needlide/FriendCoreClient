import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { SearchComponent, SearchSuggestion } from './search';

/**
 * The primitive in isolation: debounce, cancellation, listbox state, keyboard, a11y.
 * TagInput's spec covers the tag-shaped layer built on top of this.
 */
describe('SearchComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ imports: [SearchComponent] });
  });

  afterEach(() => vi.useRealTimers());

  /** Test host so we can pass signal inputs and capture outputs. */
  @Component({
    imports: [SearchComponent],
    template: `<fc-search
      [label]="label()"
      [search]="searchFn"
      [extraRow]="extraFn"
      (selected)="picked = $event"
      (submitted)="typed = $event"
    />`,
  })
  class Host {
    label = signal('Search');
    searchFn = (query: string) => {
      const req = new Subject<SearchSuggestion[] | null>();
      this.pending.push({ query, req });
      return req.asObservable();
    };
    pending: { query: string; req: Subject<SearchSuggestion[] | null> }[] = [];
    extraFn = (query: string) => ({ id: 'extra', label: `Use ${query}`, value: query });
    picked: SearchSuggestion | null = null;
    typed = '';
  }

  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    const type = (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const key = (k: string) =>
      input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    return { fixture, host, el, input, type, key };
  }

  it('exposes the combobox a11y contract', () => {
    const { el } = setup();
    const input = el.querySelector('input')!;
    expect(input.getAttribute('role')).toBe('combobox');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.getAttribute('autocomplete')).toBe('off');
  });

  it('debounces and does not search below minLength', () => {
    const { host, type } = setup();
    type('a');
    vi.advanceTimersByTime(1000);
    expect(host.pending.length).toBe(0);

    type('ab');
    vi.advanceTimersByTime(1000);
    expect(host.pending.map((p) => p.query)).toEqual(['ab']);
  });

  it('renders rows and marks aria-activedescendant on the active option', () => {
    const { host, el, type, key, fixture } = setup();
    type('ca');
    vi.advanceTimersByTime(250);
    host.pending[0].req.next([
      { id: 'a', label: 'cats', value: 'cats' },
      { id: 'b', label: 'cathedral', value: 'cathedral' },
    ]);
    host.pending[0].req.complete();
    fixture.detectChanges();

    expect(el.querySelector('[role="listbox"]')).not.toBeNull();
    expect(el.querySelectorAll('[role="option"]').length).toBe(3); // + extraRow
    const input = el.querySelector('input')!;
    expect(input.getAttribute('aria-expanded')).toBe('true');

    key('ArrowDown');
    fixture.detectChanges();
    const active = el.querySelector('[aria-selected="true"]')!;
    expect(active.textContent).toContain('cats');
    expect(input.getAttribute('aria-activedescendant')).toBe(active.getAttribute('id'));
  });

  it('commits the active row on Enter and closes the list', () => {
    const { host, el, type, key, fixture } = setup();
    type('ca');
    vi.advanceTimersByTime(250);
    host.pending[0].req.next([{ id: 'a', label: 'cats', value: 'cats' }]);
    host.pending[0].req.complete();
    fixture.detectChanges();

    key('ArrowDown');
    key('Enter');
    fixture.detectChanges();
    expect(host.picked?.value).toBe('cats');
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it('emits free text via submitted when the list is closed', () => {
    const { host, el, type, key, fixture } = setup();
    type('hello world');
    key('Enter');
    fixture.detectChanges();
    expect(host.typed).toBe('hello world');
    expect((el.querySelector('input') as HTMLInputElement).value).toBe('');
  });

  it('cancels a superseded request so a stale response cannot render', () => {
    const { host, el, type, fixture } = setup();
    type('ca');
    vi.advanceTimersByTime(250);
    const stale = host.pending[0];
    type('cat');
    vi.advanceTimersByTime(250);

    // switchMap unsubscribed the first request; the stale subject has no listeners.
    expect(stale.req.observed).toBe(false);

    host.pending[1].req.next([{ id: 't', label: 'cats', value: 'cats' }]);
    host.pending[1].req.complete();
    fixture.detectChanges();
    expect(el.textContent).toContain('cats');
  });

  it('keeps the list closed when the search errors', () => {
    const { host, el, type, fixture } = setup();
    type('ca');
    vi.advanceTimersByTime(250);
    host.pending[0].req.error(new Error('boom'));
    fixture.detectChanges();
    expect(el.querySelector('[role="listbox"]')).toBeNull();
  });

  /**
   * Regression: catchError used to sit AFTER switchMap, so a single failed search
   * completed the outer chain and left the widget permanently dead — every later
   * keystroke searched nothing, silently. The error is caught inside switchMap now.
   */
  it('keeps searching after a failure', () => {
    const { host, el, type, fixture } = setup();
    type('ca');
    vi.advanceTimersByTime(250);
    host.pending[0].req.error(new Error('boom'));
    fixture.detectChanges();

    type('cats');
    vi.advanceTimersByTime(250);
    expect(host.pending.length).toBe(2);
    host.pending[1].req.next([{ id: 'k', label: 'kittens', value: 'kittens' }]);
    host.pending[1].req.complete();
    fixture.detectChanges();
    expect(el.textContent).toContain('kittens');
  });

  it('Escape closes without committing', () => {
    const { host, el, type, key, fixture } = setup();
    type('ca');
    vi.advanceTimersByTime(250);
    host.pending[0].req.next([{ id: 'a', label: 'cats', value: 'cats' }]);
    host.pending[0].req.complete();
    fixture.detectChanges();

    key('ArrowDown');
    key('Escape');
    fixture.detectChanges();
    expect(el.querySelector('[role="listbox"]')).toBeNull();
    expect(host.picked).toBeNull();
  });
});
