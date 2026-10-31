import { Component, input, model } from '@angular/core';
import { Tooltip } from './tooltip';

/**
 * The creator's own media-safety declaration (API §7.4, detection layer 1).
 *
 * ONE switch for the DM composer. The post composer uses the fuller `fc-content-settings`
 * drawer instead, because it also declares arachnophobia/explicit content; both write the
 * same `flashing` + `intenseMotion` keys into the one `SafetyFlags` dictionary. It was a
 * per-surface block of markup before, which is exactly how the two flashing/motion checkboxes
 * drifted into being duplicated identical controls.
 *
 * Why one box and not two: the viewer gates on the `flashing` and `intenseMotion` safety flags
 * behind a single preference, with one placeholder and one message.
 * The two flags are indistinguishable to the reader, so two checkboxes asked a question with
 * no answer — and a user could untick the wrong one while a shaky video passed. Ticking this
 * sets both flags, which is deliberate over-flagging: the creator can say "one of these might
 * apply", not which. The flags stay distinct in the dictionary because they are the natural
 * inputs to automated flashing detection, and a photosensitivity seizure risk is a harder
 * hazard than a motion nuisance.
 *
 * The parent owns the state (a `model` binding, not an internal signal) because the value has
 * to be read at upload time, and the post composer sends its flags the moment a file is picked.
 * Keeping it here means neither surface can forget to wire it.
 */
@Component({
  selector: 'fc-safety-declaration',
  imports: [Tooltip],
  template: `
    <label class="check">
      <input
        type="checkbox"
        [checked]="declared()"
        [disabled]="disabled()"
        (change)="declared.set($any($event.target).checked)"
      />
      Contains flashing lights or intense motion
    </label>
    <fc-tooltip [text]="HELP" label="What does this flag do?" />
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--fc-space-1);
      font-size: var(--fc-text-sm);
      color: var(--fc-text-muted);
    }

    .check {
      display: inline-flex;
      align-items: center;
      gap: var(--fc-space-1);
      cursor: pointer;
    }

    .check:has(input:disabled) {
      cursor: default;
      opacity: 0.6;
    }
  `,
})
export class SafetyDeclaration {
  /**
   * The creator's declaration. Two-way bound by the parent so it survives the attachment
   * lifecycle (upload → processing → ready) without being reset mid-publish.
   */
  readonly declared = model(false);

  /**
   * Disabled while an upload is in flight. The flags are read at upload time, so changing the
   * box afterwards would silently do nothing — better to say so than to accept a setting that
   * has no effect.
   */
  readonly disabled = input(false);

  /**
   * The explanation, kept honest about the limits: this is a self-declaration, it does not
   * hide the image from everyone, and a moderator or another user can still flag it
   * independently. Overstating it ("warns everyone") would be the version that misleads.
   */
  protected readonly HELP =
    'People who have turned on "Hide flashing media" in Settings will see a ' +
    'warning placeholder instead of this image, and the file is not loaded at all ' +
    'until they choose to show it. Everyone else sees it normally — this is your own ' +
    'declaration, and a moderator can still flag the image independently.';
}
