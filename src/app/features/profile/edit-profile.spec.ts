import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { EditProfile } from './edit-profile';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const me = {
  accessToken: 'token',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  userId: 'u9',
  username: 'alice',
  displayName: 'Alice',
  isEmailVerified: true,
};

const profile = {
  userId: 'u9',
  username: 'alice',
  displayName: 'Alice',
  bio: 'hello world',
  websiteUrl: null,
  location: 'Kyiv',
  isVerified: true,
  createdAt: new Date().toISOString(),
};

describe('EditProfile', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([EditProfile]);
    http = TestBed.inject(HttpTestingController);
    // Signed in as alice before the form exists (it prefills from the server).
    TestBed.inject(AuthService).login({ username: 'alice', password: 'password123' }).subscribe();
    expectApi(http, '/auth/login').flush(me);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(EditProfile);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('prefills the form with current values', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/alice').flush(profile);
    fixture.detectChanges();
    const values = Array.from(el.querySelectorAll<HTMLInputElement>('input, textarea')).map(
      (i) => i.value,
    );
    expect(values).toContain('Alice');
    expect(values).toContain('hello world');
    expect(values).toContain('Kyiv');
  });

  it('saves and stays put with a View-profile link (no redirect)', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/alice').flush(profile);
    fixture.detectChanges();

    const bio = el.querySelector('#ep-bio') as HTMLTextAreaElement;
    bio.value = 'new bio';
    bio.dispatchEvent(new Event('input'));
    el.querySelector('form')!.requestSubmit();

    const req = expectApi(http, '/users/me/profile');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toMatchObject({ bio: 'new bio' });
    req.flush({ ...profile, bio: 'new bio' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Saved.');
    expect(el.querySelector('a[href="/u/alice"]')).not.toBeNull();
  });
});
