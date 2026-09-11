import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { catchError, debounceTime, distinctUntilChanged, filter, of, switchMap } from 'rxjs';
import { TagsService } from './tags.service';
import { TagSuggestion } from '../../core/models/tags.models';

/**
 * Debounced tag autocomplete combobox (docs/design/components.md §TagInput).
 *
 * The Rx pipeline is the whole lesson — read it as a sentence:
 * "take keystrokes, wait 250 ms after the user pauses, ignore repeats and
 * too-short queries, then ask the server — cancelling the previous request if a
 * newer keystroke arrived (switchMap), and treating any error as 'no suggestions'."
 *
 * Why each operator matters:
 *  - debounceTime(250): the spec asks for 200–300 ms after the last keystroke, so we
 *    don't DDoS the server per character.
 *  - distinctUntilChanged: re-renders (or a pasted-then-undone value) don't refetch.
 *  - filter(len ≥ 2): the server's minimum tag length — shorter queries can't match.
 *  - switchMap (not mergeMap): only the LATEST query's answer may render. Without it,
 *    a slow response for "ca" could overwrite the fresh results for "cat".
 *  - catchError → `of(null)`: a failed suggestion fetch must never break typing; the
 *    list just stays closed and the user can still submit a free-text tag.
 *
 * Emits `tagAdd(name)` when the user picks a suggestion, presses Enter on free text,
 * or chooses the "first to use it" row. The parent owns the tag list and limits.
 */
@Component({
  selector: 'fc-tag-input',
  imports: [ReactiveFormsModule],
  templateUrl: './tag-input.html',
  styleUrl: './tag-input.scss',
})
export class TagInput {
  private readonly tags = inject(TagsService);

  /** Visible label for the input (persistent — never placeholder-only, WCAG 3.3.2). */
  label = input.required<string>();
  /** Placeholder hint, e.g. "photography, synths…". */
  placeholder = input<string>('');
  /** When true the input disables (used when the tier limit is reached). */
  disabled = input(false);
  /** Fires with the chosen tag name (suggestion, free text, or first-use). */
  readonly tagAdd = output<string>();

  // Unique ids per instance so <label for> and aria-controls never collide when two
  // TagInputs (primary + secondary) sit on the same page.
  private static nextId = 0;
  private readonly uid = `fc-tag-${++TagInput.nextId}`;
  protected get inputId(): string {
    return `${this.uid}-input`;
  }
  protected get listId(): string {
    return `${this.uid}-list`;
  }
  protected optionId(i: number): string {
    return `${this.uid}-opt-${i}`;
  }
  protected activeDescendant(): string | null {
    const i = this.activeIndex();
    return i >= 0 ? this.optionId(i) : null;
  }
  /** Current trimmed text, for the "you're the first" row. */
  protected currentText(): string {
    return this.currentValue();
  }
  /** Reopen the listbox on focus when results are already cached. */
  protected reopen(): void {
    if (
      this.suggestions().length > 0 ||
      (!this.hasExactMatch() && this.currentValue().length >= 2)
    ) {
      this.open.set(true);
    }
  }

  protected readonly search = new FormControl('', { nonNullable: true });
  protected readonly open = signal(false);
  protected readonly suggestions = signal<TagSuggestion[]>([]);
  protected readonly hasExactMatch = signal(true);
  protected readonly activeIndex = signal(-1);

  /** Free-text value trimmed — the "first to use it" candidate. */
  private currentValue(): string {
    return this.search.value.trim();
  }

  constructor() {
    // The form control's valueChanges IS already an observable — subscribe the pipeline
    // to it directly (toObservable is for signals; valueChanges needs no bridge).
    this.search.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        filter((q) => q.trim().length >= 2),
        switchMap((q) => this.tags.autocomplete(q.trim()).pipe(catchError(() => of(null)))),
      )
      .subscribe((res) => {
        this.suggestions.set(res?.suggestions ?? []);
        this.hasExactMatch.set(res?.hasExactMatch ?? true);
        this.activeIndex.set(-1);
        this.open.set((res?.suggestions.length ?? 0) > 0 || res?.hasExactMatch === false);
      });

    // Mirror the disabled input into the form control via an effect: whenever the
    // parent's signal changes, the control follows. (Effects need no manual
    // unsubscribe — Angular tears them down with the component.)
    effect(() => {
      const d = this.disabled();
      if (d) this.search.disable({ emitEvent: false });
      else this.search.enable({ emitEvent: false });
    });
  }

  /** Rows rendered in the listbox: suggestions plus the first-use row when applicable. */
  protected readonly rows = computed(
    () => this.suggestions().length + (this.showFirstUse() ? 1 : 0),
  );

  protected showFirstUse(): boolean {
    return this.open() && !this.hasExactMatch() && this.currentValue().length >= 2;
  }

  protected pickSuggestion(s: TagSuggestion): void {
    this.tagAdd.emit(s.name);
    this.reset();
  }

  protected pickFirstUse(): void {
    const value = this.currentValue();
    if (value.length >= 2) {
      this.tagAdd.emit(value);
      this.reset();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!this.open()) {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.pickFirstUse();
      }
      return;
    }
    const max = this.rows() - 1;
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
        if (i >= 0 && i < this.suggestions().length) this.pickSuggestion(this.suggestions()[i]);
        else this.pickFirstUse();
        break;
      }
      case 'Escape':
        this.open.set(false);
        this.activeIndex.set(-1);
        break;
    }
  }

  protected onBlur(): void {
    // Delay closing so a click on a suggestion lands before the listbox vanishes.
    setTimeout(() => this.open.set(false), 150);
  }

  private reset(): void {
    this.search.setValue('');
    this.suggestions.set([]);
    this.open.set(false);
    this.activeIndex.set(-1);
  }
}
