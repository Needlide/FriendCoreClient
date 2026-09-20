import { Route } from '@angular/router';
import { routes } from './app.routes';

/**
 * Route-table guard: every UI-Plan §1 path must resolve. The notifications page
 * once shipped fully built with no route pointing at it — the bell linked nowhere
 * and the wildcard silently bounced home. This pins the table so a lost route
 * fails the suite instead of reaching a tester.
 */
describe('app.routes', () => {
  function paths(rs: Route[], prefix = ''): string[] {
    return rs.flatMap((r) => {
      const full = (prefix + '/' + (r.path ?? '')).replace(/\/+/g, '/').replace(/^\//, '');
      const children = r.children ? paths(r.children, full) : [];
      return [full, ...children];
    });
  }

  it('exposes every MVP path', () => {
    const table = paths(routes);
    for (const expected of [
      'auth/login',
      'auth/register',
      'auth/verify-email',
      'auth/forgot-password',
      'auth/reset-password',
      '',
      'onboarding',
      'discover',
      'u/:username',
      'settings',
      'settings/profile',
      'settings/interests',
      'settings/preferences',
      'settings/filters',
      'settings/appeals',
      'settings/account',
      'messages',
      'messages/:id',
      'notifications',
      'help',
    ]) {
      expect(table).toContain(expected);
    }
  });
});
