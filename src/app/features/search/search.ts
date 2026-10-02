import { Component, DestroyRef, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Observable,
  Subject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  of,
  switchMap,
} from 'rxjs';

/**
 * One row in a search listbox. Minimal by design: an id (for aria-activedescendant),
 * a stable key (for @for tracking), a display label, and the value the consumer commits.
 *
 * TagInput renders `label` plus an optional `meta` count; a GIF search would add a
 * thumbnail and use `value` for the media id. Keeping the primitive free of tag and
 * URL knowledge is what lets both build on it without copying markup.
 */
export interface SearchSuggestion<T = unknown> {
  id: string;
  label: string;
  /** Optional right-aligned detail ("12 people", a GIF duration). */
  meta?: string;
  /** Consumer-defined value committed on selection. */
  value: T;
}

/** What one debounced query produced. Distinguishes "empty" from "failed". */
type SearchOutcome = { suggestions: SearchSuggestion[] | null; errored: boolean };

/** Too short to ask the server — the local answer. */
const NO_RESULTS: SearchOutcome = { suggestions: null, errored: false };
/** The transport failed; the listbox must stay shut. */
const SEARCH_ERRORED: SearchOutcome = { suggestions: null, errored: true };

/**
 * A11y contract for the listbox, named so the template below and any consumer spec can
 * refer to it explicitly.
 *
 * role=combobox on the input (with aria-expanded + aria-controls), role=listbox on the
 * popup, role=option on each row with aria-selected, and aria-activedescendant on the
 * input pointing at the keyboard-active row. Focus never leaves the input — the listbox
 * is a popup, not a focus target, so the whole widget is a single tab stop.
 */
export const SEARCH_LISTBOX_A11Y = {
  input: { role: 'combobox', expanded: 'aria-expanded', controls: 'aria-controls' },
  list: { role: 'listbox' },
  option: { role: 'option', selected: 'aria-selected' },
  activeDescendant: 'aria-activedescendant',
} as const;

/**
 * Autocomplete combobox primitive: owns the input, the debounce, the request
 * lifecycle, the listbox open/close state, and ALL keyboard interaction. It knows
 * nothing about WHAT is being searched — the consumer supplies the transport and
 * interprets the rows.
 *
 * Extracted from TagInput (docs/design/components.md §TagInput), which is now built on
 * top of it. The Rx pipeline is the whole lesson — read it as a sentence:
 * "take keystrokes, wait for the debounce, ignore repeats and too-short queries,
 * then ask — cancelling the previous request if a newer keystroke arrived
 * (switchMap), and treating any error as 'no results'."
 *
 * Why each operator matters:
 *  - debounceTime: the spec asks for 200–300 ms after the last keystroke, so we
 *    don't DDoS the server per character.
 *  - distinctUntilChanged: re-renders (or a pasted-then-undone value) don't refetch.
 *  - short queries (< minLength) resolve locally to `null` rather than being filtered
 *    out: a filter would short-circuit the chain and leave the listbox OPEN showing
 *    the PREVIOUS query's results.
 *  - switchMap (NOT mergeMap): only the LATEST query's answer may render. Without it a
 *    slow response for "ca" could overwrite the fresh results for "cat". mergeMap
 *    would let both complete and the last to arrive would win — that is the bug, not
 *    the fix.
 *  - catchError → `of(null)`: a failed search must never break typing; the list stays
 *    closed and the user can still submit free text.
 *
 * Emits {@link selected} when a row is committed and {@link submitted} when the user
 * types something matching no row verbatim. It never mutates domain state itself.
 */
@Component({
  selector: 'fc-search',
  template: `
    <label [for]="inputId()">{{ label() }}</label>
    <div class="combo-wrap">
      <input
        #input
        [id]="inputId()"
        type="text"
        role="combobox"
        autocomplete="off"
        aria-autocomplete="list"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="open() ? listId() : null"
        [attr.aria-activedescendant]="activeDescendant()"
        [placeholder]="placeholder()"
        [disabled]="disabled()"
        [value]="value()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        (focus)="onFocus()"
        (blur)="onBlur()"
      />
      @if (open()) {
        <ul class="suggestions" role="listbox" [id]="listId()">
          @for (row of rows(); track row.id) {
            <li
              role="option"
              [id]="optionId($index)"
              [attr.aria-selected]="$index === activeIndex()"
              [class.active]="$index === activeIndex()"
              (mousedown)="commit($index)"
            >
              <span>{{ row.label }}</span>
              @if ($index === activeIndex()) {
                <span class="kbd" aria-hidden="true">⏎</span>
              } @else if (row.meta) {
                <span class="count">{{ row.meta }}</span>
              }
            </li>
          } @empty {
            <li class="none" role="presentation">No matches</li>
          }
        </ul>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    label {
      display: block;
      font-size: var(--fc-text-sm);
      font-weight: 600;
      margin-bottom: var(--fc-space-1);
    }

    .combo-wrap {
      position: relative;
    }

    input {
      font: inherit;
      color: var(--fc-text);
      background: var(--fc-surface);
      border: 1px solid var(--fc-border);
      border-radius: var(--fc-radius-sm);
      padding: var(--fc-space-2) var(--fc-space-3);
      width: 100%;
    }

    input:disabled {
      opacity: 0.55;
    }

    .suggestions {
      position: absolute;
      z-index: 20;
      left: 0;
      right: 0;
      margin: var(--fc-space-1) 0 0;
      padding: var(--fc-space-1);
      list-style: none;
      background: var(--fc-surface);
      border: 1px solid var(--fc-border);
      border-radius: var(--fc-radius-sm);
      box-shadow: var(--fc-shadow);
      max-height: 14rem;
      overflow-y: auto;
    }

    .suggestions li {
      display: flex;
      justify-content: space-between;
      gap: var(--fc-space-2);
      padding: var(--fc-space-2) var(--fc-space-3);
      border-radius: var(--fc-radius-sm);
      cursor: pointer;
    }

    .suggestions li.active {
      background: var(--fc-surface-2);
    }

    .suggestions .count {
      color: var(--fc-text-muted);
      font-size: var(--fc-text-sm);
      white-space: nowrap;
    }

    .suggestions .kbd {
      color: var(--fc-text-muted);
      font-size: var(--fc-text-sm);
      border: 1px solid var(--fc-border);
      border-radius: var(--fc-radius-sm);
      padding: 0 var(--fc-space-1);
    }

    .suggestions .none {
      color: var(--fc-text-muted);
      cursor: default;
    }
  `,
})
export class SearchComponent {
  private readonly destroyRef = inject(DestroyRef);

  /** Visible label for the input (persistent — never placeholder-only, WCAG 3.3.2). */
  readonly label = input.required<string>();
  readonly placeholder = input<string>('');
  readonly disabled = input(false);

  /** Queries shorter than this are answered locally and never hit the transport. */
  readonly minLength = input(2);
  /** Quiet pause after the last keystroke, in ms. */
  readonly debounceMs = input(250);

  /**
   * The transport, supplied by the consumer. Returning `null` means "answered
   * locally" (query too short) and skips the request entirely.
   */
  readonly search = input.required<(query: string) => Observable<SearchSuggestion[] | null>>();

  /**
   * Optional row appended after the suggestions — TagInput's "you're the first".
   * Returning null means no extra row for that query. Pair it with a
   * {@link submitted} handler so free text still commits.
   */
  readonly extraRow = input<(query: string) => SearchSuggestion | null>(() => null);

  /** Fired when a row is committed by click, Enter or Arrow navigation. */
  readonly selected = output<SearchSuggestion>();
  /** Fired by Enter when the user typed free text matching no row. */
  readonly submitted = output<string>();

  protected readonly open = signal(false);
  protected readonly activeIndex = signal(-1);
  protected readonly rows = signal<SearchSuggestion[]>([]);

  /**
   * The text in the box. Held as a signal rather than read back from the DOM so that
   * every consumer (extraRow, free-text commit, reset) sees the same value without a
   * viewChild round-trip — and so the input can be reset declaratively via [value].
   */
  private readonly value = signal('');

  /**
   * Also cleared directly on reset. `[value]` alone is not enough: once the user has
   * typed, the DOM node's value has diverged from the last bound expression value, and
   * a one-way binding is not guaranteed to push the empty string back down. The old
   * FormControl-based implementation emptied the node synchronously, so the box cleared
   * the instant a tag was added; preserve that guarantee rather than depend on a
   * change-detection tick landing.
   */
  private readonly inputEl = viewChild<HTMLInputElement>('input');

  /** Raw keystrokes; the debounce and query rules live in the constructor pipeline. */
  private readonly query$ = new Subject<string>();
  private blurTimer: ReturnType<typeof setTimeout> | null = null;

  // Unique ids per instance so <label for> and aria-controls never collide when two
  // searches sit on the same page (TagInput renders primary + secondary side by side).
  private static nextId = 0;
  protected readonly uid = `fc-search-${++SearchComponent.nextId}`;

  constructor() {
    this.query$
      .pipe(
        debounceTime(this.debounceMs()),
        distinctUntilChanged(),
        switchMap((raw) => {
          const query = raw.trim();
          // Short queries resolve locally rather than being filtered out: filtering
          // short-circuits the chain and leaves the listbox open showing the
          // PREVIOUS query's results.
          if (query.length < this.minLength()) return of(NO_RESULTS);
          return this.search()(query).pipe(
            map((suggestions) => ({ suggestions, errored: false })),
            // catchError sits INSIDE switchMap on purpose. Placed after it, the error
            // would complete the outer chain and leave the widget permanently dead:
            // one failed request would mean no keystroke ever searched again.
            catchError(() => of(SEARCH_ERRORED)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((outcome) => this.applyResults(outcome));
  }

  protected inputId(): string {
    return `${this.uid}-input`;
  }
  protected listId(): string {
    return `${this.uid}-list`;
  }
  protected optionId(i: number): string {
    return `${this.uid}-opt-${i}`;
  }
  protected activeDescendant(): string | null {
    const i = this.activeIndex();
    return i >= 0 ? this.optionId(i) : null;
  }

  protected onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.value.set(text);
    this.query$.next(text);
  }

  protected onFocus(): void {
    this.clearBlurTimer();
    if (this.rows().length > 0) this.open.set(true);
  }

  protected onBlur(): void {
    // Delay closing so a mousedown on a row lands before the listbox vanishes.
    this.clearBlurTimer();
    this.blurTimer = setTimeout(() => this.close(), 150);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.open()) {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.commitFreeText();
      }
      return;
    }
    const max = this.rows().length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.activeIndex.set(this.activeIndex() >= max ? 0 : this.activeIndex() + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.activeIndex.set(this.activeIndex() <= 0 ? max : this.activeIndex() - 1);
        break;
      case 'Enter': {
        event.preventDefault();
        const i = this.activeIndex();
        if (i >= 0 && i < this.rows().length) this.commit(i);
        else this.commitFreeText();
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  /** mousedown rather than click, so the row commits before blur() closes the list. */
  protected commit(index: number): void {
    const row = this.rows()[index];
    if (!row) return;
    this.selected.emit(row);
    this.reset();
  }

  /** Programmatic reset — the consumer calls this after committing a value. */
  reset(): void {
    this.clearBlurTimer();
    this.value.set('');
    this.rows.set([]);
    this.activeIndex.set(-1);
    this.open.set(false);
    const el = this.inputEl();
    if (el) el.value = '';
  }

  /** The text currently in the box, for consumers building the extra row. */
  currentQuery(): string {
    return this.value();
  }

  private commitFreeText(): void {
    const text = this.currentQuery().trim();
    if (text.length === 0) return;
    this.submitted.emit(text);
    this.reset();
  }

  private applyResults(outcome: SearchOutcome): void {
    const query = this.currentQuery().trim();
    const suggestions = outcome.suggestions;
    // An error is NOT an empty result: it must leave the listbox shut rather than
    // offering a "create this" row for a query the server never actually answered.
    const extra =
      outcome.errored || suggestions === null || query.length < this.minLength()
        ? null
        : this.extraRow()(query);
    const base = suggestions ?? [];
    const rows = extra ? [...base, extra] : base;
    this.rows.set(rows);
    this.activeIndex.set(-1);
    this.open.set(rows.length > 0);
  }

  private close(): void {
    this.open.set(false);
    this.activeIndex.set(-1);
  }

  private clearBlurTimer(): void {
    if (this.blurTimer !== null) {
      clearTimeout(this.blurTimer);
      this.blurTimer = null;
    }
  }
}
