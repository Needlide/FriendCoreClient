import { Component, computed, input } from '@angular/core';

export interface TextSegment {
  /** Rendered as a link when present, as plain text otherwise. */
  url: string | null;
  text: string;
}

/**
 * Renders user text with clickable links. Segmentation happens in TypeScript and
 * each piece renders as a native text node or anchor — never innerHTML — so there
 * is no XSS surface no matter what the text contains. Newlines are preserved by
 * the consumer's `white-space: pre-line` (same as plain post content).
 *
 * URL shape: http(s):// up to whitespace or delimiters, with trailing punctuation
 * (.,;:!?) trimmed — "see example.com." links the domain, not the period.
 */
@Component({
  selector: 'fc-linkified-text',
  template: `
    @for (seg of segments(); track $index) {
      @if (seg.url) {
        <a [href]="seg.url" target="_blank" rel="noopener">{{ seg.text }}</a>
      } @else {
        {{ seg.text }}
      }
    }
  `,
})
export class LinkifiedText {
  text = input<string>('');

  protected readonly segments = computed(() => splitLinks(this.text() ?? ''));

  // Exported for specs: pure function, no DOM involved.
  static split = splitLinks;
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/g;
const TRAILING_PUNCT = /[.,;:!?]+$/;

export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const trimmed = raw.replace(TRAILING_PUNCT, '');
    const trailing = raw.slice(trimmed.length);
    if (index > lastIndex) segments.push({ url: null, text: text.slice(lastIndex, index) });
    if (trimmed.length > 0) segments.push({ url: trimmed, text: trimmed });
    if (trailing.length > 0) segments.push({ url: null, text: trailing });
    lastIndex = index + raw.length;
  }
  if (lastIndex < text.length) segments.push({ url: null, text: text.slice(lastIndex) });
  if (segments.length === 0) segments.push({ url: null, text });
  return segments;
}
