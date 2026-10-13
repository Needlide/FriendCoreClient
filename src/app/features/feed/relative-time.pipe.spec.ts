import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  let pipe: RelativeTimePipe;

  beforeEach(() => {
    pipe = new RelativeTimePipe();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Freeze "now" so the pipe's arithmetic is deterministic. */
  const freezeNow = (): void => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-13T12:00:00Z').getTime());
  };

  const at = (offsetSeconds: number): string =>
    new Date(new Date('2026-10-13T12:00:00Z').getTime() + offsetSeconds * 1000).toISOString();

  it('reads past timestamps as ago', () => {
    freezeNow();
    expect(pipe.transform(at(-30))).toBe('30 seconds ago');
    expect(pipe.transform(at(-300))).toBe('5 minutes ago');
    expect(pipe.transform(at(-7200))).toBe('2 hours ago');
  });

  it('never renders a future timestamp as "in ..."', () => {
    // The regression: a server-stamped message on a client whose clock lagged read
    // "in 22 seconds", telling the reader it had not happened yet.
    freezeNow();
    expect(pipe.transform(at(1))).toBe('now');
    expect(pipe.transform(at(22))).toBe('now');
    expect(pipe.transform(at(3600))).toBe('now');
  });

  it('returns empty for an unparseable timestamp', () => {
    expect(pipe.transform('not-a-date')).toBe('');
  });
});
