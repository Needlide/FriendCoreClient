import { Component, ElementRef, inject, input, signal, DestroyRef } from '@angular/core';

/**
 * A small explanatory note attached to a trigger, shown on hover and keyboard focus.
 *
 * Generic on purpose: it knows nothing about what it explains, so the same component covers
 * the media-safety checkboxes today and anything else that needs a "what does this do?"
 * affordance tomorrow.
 *
 * The accessibility contract is WCAG 1.4.13 (Content on Hover or Focus) plus the project's
 * own checklist in content-and-a11y.md §1.4.13, which asks for three things that naive
 * CSS-only tooltips get wrong:
 *
 *  - **Hoverable.** Hover handlers sit on the HOST, not the trigger, so moving the pointer
 *    from the "?" onto the bubble never crosses a boundary. Hiding on the trigger's
 *    mouseleave makes the bubble unreachable, because the text you need to read IS the
 *    thing that vanishes.
 *  - **Dismissible.** Escape closes it, and so does a click on the trigger or anywhere
 *    outside — a user must never be trapped behind a tooltip they cannot dismiss.
 *  - **Persistent until dismissed.** It does not auto-close on a timer. A 5s toast-style
 *    expiry would hide the explanation while someone is still reading it.
 *
 * Click also *pins* the bubble open, which is the only way to reach it on a touch device —
 * hover does not exist there. Pinning is what makes the bubble survive the pointer leaving.
 *
 * The trigger is a real <button>, not a <span title="...">: it is focusable and operable by
 * keyboard, and `aria-describedby` means assistive tech reads the explanation with the
 * control rather than leaving it as unannounced visual text.
 */
@Component({
  selector: 'fc-tooltip',
  templateUrl: './tooltip.html',
  styleUrl: './tooltip.scss',
  host: {
    class: 'fc-tooltip',
    // Host-level, so the bubble itself counts as "inside" for both hover and focus.
    '(mouseenter)': 'pointerEnter()',
    '(mouseleave)': 'pointerLeave()',
    '(focusin)': 'focusEnter()',
    '(focusout)': 'focusLeave()',
    '(keydown.escape)': 'dismiss()',
  },
})
export class Tooltip {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);

  /** The explanation. Plain text only — never markup. */
  readonly text = input.required<string>();

  /** Accessible name for the trigger; describes the help, not the control it precedes. */
  readonly label = input('What does this do?');

  protected readonly visible = signal(false);

  /**
   * Pinned by an explicit click. A pinned tooltip outlives the pointer and the focus, so
   * "move away to dismiss" never applies to it — only Escape, the trigger, or a click
   * elsewhere does.
   */
  private pinned = false;

  constructor() {
    // Clicking anywhere outside dismisses a pinned bubble. Registered on the document
    // because the click that matters is precisely the one this component never sees.
    const onDocumentClick = (event: MouseEvent) => {
      if (this.pinned && !this.host.nativeElement.contains(event.target as Node)) {
        this.dismiss();
      }
    };
    document.addEventListener('click', onDocumentClick);
    this.destroyRef.onDestroy(() => document.removeEventListener('click', onDocumentClick));
  }

  /** Toggle-pins the bubble. The only interaction available without a pointer. */
  protected togglePinned(event: Event): void {
    event.stopPropagation();
    this.pinned = !this.pinned;
    this.visible.set(this.pinned);
  }

  protected pointerEnter(): void {
    if (!this.pinned) this.visible.set(true);
  }

  protected pointerLeave(): void {
    // A pinned bubble stays put: it was opened deliberately, not brushed past.
    if (!this.pinned) this.visible.set(false);
  }

  protected focusEnter(): void {
    if (!this.pinned) this.visible.set(true);
  }

  protected focusLeave(): void {
    if (!this.pinned) this.visible.set(false);
  }

  /** Escape, the trigger, or a click outside — any of these unpins and closes. */
  protected dismiss(): void {
    this.pinned = false;
    this.visible.set(false);
  }

  protected readonly tooltipId = `fc-tooltip-${nextId()}`;
}

let counter = 0;
/** Unique per instance so several tooltips on one page never cross-reference each other. */
function nextId(): string {
  counter += 1;
  return counter.toString();
}
