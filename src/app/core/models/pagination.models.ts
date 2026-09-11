/**
 * Cursor pagination. `nextCursor` is an opaque server string — pass it back verbatim
 * for the next page; `null` means the end. Never construct cursors client-side.
 *
 * Note: list endpoints name their array differently (feed → `items`, messages →
 * `messages`). This generic models the common `items` case; map other shapes into it.
 */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
