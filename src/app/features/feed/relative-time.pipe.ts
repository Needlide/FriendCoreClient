import { Pipe, PipeTransform } from '@angular/core';

/**
 * "2h ago" style relative time, updating per render (pure pipe — re-evaluates when
 * the input changes; feed renders are infrequent enough that staleness by minutes
 * is fine, and a timer per card would be wasteful). The <time datetime> element in
 * the template keeps the exact instant accessible regardless.
 */
@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  transform(iso: string): string {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return '';
    const seconds = Math.round((then - Date.now()) / 1000);
    const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    // Anything in the future reads "now", never "in N seconds".
    //
    // The server stamps the arrival time, so a message sent right now is genuinely a
    // little ahead of a client whose clock lags — network latency, a phone drifting a
    // few seconds, or a clock corrected mid-session. Intl renders a positive offset as
    // "in 22 seconds", which is worse than useless: it tells the reader the message has
    // not happened yet. Past messages still shift by the same constant and read
    // correctly, so only the most recent ones look wrong — which is exactly how this
    // was reported.
    //
    // A message cannot arrive from the future, so "now" is the truthful label. The
    // exact instant stays in the element's datetime attribute for anyone who needs it.
    if (seconds > 0) return fmt.format(0, 'second');

    const abs = Math.abs(seconds);
    if (abs < 60) return fmt.format(Math.trunc(seconds / 1), 'second');
    if (abs < 3600) return fmt.format(Math.trunc(seconds / 60), 'minute');
    if (abs < 86400) return fmt.format(Math.trunc(seconds / 3600), 'hour');
    if (abs < 86400 * 30) return fmt.format(Math.trunc(seconds / 86400), 'day');
    return new Date(then).toLocaleDateString();
  }
}
