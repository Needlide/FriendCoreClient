/**
 * Media safety flags as the API sees them: one dictionary, not one field per hazard.
 *
 * The server stores this as a single JSONB column and accepts it as one `SafetyFlags` form
 * field, so adding a hazard is a client-only change — no migration, no new API parameter.
 * Keep the canonical key list here so the composer, the DM thread, and the models cannot
 * drift apart.
 */
export type SafetyFlags = Record<string, boolean>;

/**
 * Every flag the client currently knows about, all off.
 *
 * Spread this and override the ones a surface can set. A surface that does not offer a
 * toggle still sends the key as `false`, which keeps the payload shape stable for the
 * server and for anyone reading a stored row.
 */
export const SAFETY_FLAG_DEFAULTS = {
  flashing: false,
  intenseMotion: false,
  arachnophobia: false,
  explicit: false,
} as const satisfies SafetyFlags;
