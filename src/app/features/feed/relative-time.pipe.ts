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
    const abs = Math.abs(seconds);
    const fmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    if (abs < 60) return fmt.format(Math.trunc(seconds / 1), 'second');
    if (abs < 3600) return fmt.format(Math.trunc(seconds / 60), 'minute');
    if (abs < 86400) return fmt.format(Math.trunc(seconds / 3600), 'hour');
    if (abs < 86400 * 30) return fmt.format(Math.trunc(seconds / 86400), 'day');
    return new Date(then).toLocaleDateString();
  }
}
