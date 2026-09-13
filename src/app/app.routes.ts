import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';
import { Shell } from './features/shell/shell';
import { SettingsLayout } from './features/settings/settings-layout';

/**
 * MVP route table (see docs/UI-Plan.md §1). Authenticated pages render INSIDE the
 * shell (nav + bell + avatar menu) via child routes; guest pages stand alone.
 * Feature routes stay lazy-loaded.
 */
export const routes: Routes = [
  {
    path: 'auth/login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'auth/register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'auth/verify-email',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/verify-email/verify-email').then((m) => m.VerifyEmail),
  },
  {
    path: 'auth/forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'auth/reset-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/feed/feed').then((m) => m.Feed),
      },
      {
        path: 'onboarding',
        loadComponent: () => import('./features/onboarding/onboarding').then((m) => m.Onboarding),
      },
      {
        path: 'discover',
        loadComponent: () => import('./features/discovery/discovery').then((m) => m.Discovery),
      },
      {
        path: 'u/:username',
        loadComponent: () => import('./features/profile/profile').then((m) => m.Profile),
      },
      {
        path: 'settings/profile',
        loadComponent: () => import('./features/profile/edit-profile').then((m) => m.EditProfile),
      },
      {
        path: 'messages',
        loadComponent: () =>
          import('./features/messaging/conversations').then((m) => m.Conversations),
      },
      {
        path: 'messages/:id',
        loadComponent: () => import('./features/messaging/thread').then((m) => m.Thread),
      },
      {
        path: 'settings',
        component: SettingsLayout,
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'profile' },
          {
            path: 'profile',
            loadComponent: () =>
              import('./features/profile/edit-profile').then((m) => m.EditProfile),
          },
          {
            path: 'interests',
            loadComponent: () => import('./features/settings/interests').then((m) => m.Interests),
          },
          {
            path: 'preferences',
            loadComponent: () =>
              import('./features/settings/preferences').then((m) => m.Preferences),
          },
          {
            path: 'filters',
            loadComponent: () =>
              import('./features/settings/keyword-filters').then((m) => m.KeywordFilters),
          },
          {
            path: 'appeals',
            loadComponent: () => import('./features/settings/appeals').then((m) => m.Appeals),
          },
          {
            path: 'account',
            loadComponent: () => import('./features/settings/account').then((m) => m.Account),
          },
        ],
      },
      {
        path: 'help',
        loadComponent: () => import('./features/help/help').then((m) => m.Help),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
