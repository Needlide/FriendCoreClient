import { Component, inject, model, viewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Tooltip } from './tooltip';

/**
 * Content settings drawer (native `<dialog>`, same pattern as `ReportDialog`).
 *
 * One place for every creator self-declaration about media they're about to upload:
 * flashing/intense motion (one toggle, two flags), arachnophobia content, and explicit
 * content. Keeps the composer clean no matter how many toggles accumulate — adding a new
 * hazard means one more row here plus one key in `SAFETY_FLAG_DEFAULTS`, never another
 * checkbox crammed into the composer.
 *
 * The parent owns all state (model bindings, not internal signals) because the values
 * have to be read at upload time, and the post composer sends its flags the moment a file
 * is picked.
 */
@Component({
  selector: 'fc-content-settings',
  imports: [FormsModule, Tooltip],
  templateUrl: './content-settings.html',
  styleUrl: './content-settings.scss',
  host: {
    class: 'fc-content-settings',
  },
})
export class ContentSettings {
  /** Two-way bound by the parent so values survive the dialog open/close lifecycle. */
  readonly flashing = model(false);
  readonly arachnophobia = model(false);
  readonly explicit = model(false);

  protected readonly FLASHING_HELP =
    'People who have turned on "Hide flashing media" in Settings will see a ' +
    'warning placeholder instead of this image, and the file is not loaded at all ' +
    'until they choose to show it. Everyone else sees it normally — this is your own ' +
    'declaration, and a moderator can still flag the image independently.';

  protected readonly ARACHNOPHOBIA_HELP =
    'People who have turned on "Hide spiders and arachnids" in Settings will see a ' +
    'warning placeholder instead of this image, and the file is not loaded at all ' +
    'until they choose to show it. Everyone else sees it normally — this is your own ' +
    'declaration, and a moderator can still flag the image independently.';

  protected readonly EXPLICIT_HELP =
    'People who have chosen "Everything, including explicit" as their content preference ' +
    'see this image normally. Everyone else sees a warning placeholder first and can choose ' +
    'to show it. Feed visibility still follows the post\'s own sensitivity setting, so this ' +
    'flag is a warning, not a filter.';

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  /** Open the drawer as a modal. Call from the composer's "Content settings" button. */
  open(): void {
    this.dialog()?.nativeElement.showModal();
  }

  /** Close the drawer. */
  close(): void {
    this.dialog()?.nativeElement.close();
  }
}
