import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LikersDialog } from './likers-dialog';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const users = [
  {
    userId: 'u1',
    username: 'alice',
    displayName: 'Alice Stone',
    isVerified: true,
    isFollowedByViewer: false,
  },
  {
    userId: 'u2',
    username: 'bob',
    displayName: 'Bob Reyes',
    isVerified: false,
    isFollowedByViewer: false,
  },
];

describe('LikersDialog', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    // jsdom implements <dialog> markup but not the modal methods.
    window.HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    window.HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
    await configureAuthTestBed([LikersDialog]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(LikersDialog);
    fixture.componentRef.setInput('postId', 'p1');
    fixture.detectChanges();
    fixture.componentInstance.open();
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('loads likers on open and links each one to their profile', () => {
    const { fixture, el } = create();
    expectApi(http, '/posts/p1/likes').flush({ users });
    fixture.detectChanges();

    expect(el.querySelector('dialog')?.hasAttribute('open')).toBe(true);
    expect(el.textContent).toContain('Alice Stone');
    expect(el.textContent).toContain('@alice');
    expect(el.textContent).toContain('Bob Reyes');
    expect(el.querySelector('a[href="/u/alice"]')).not.toBeNull();
  });

  it('shows a calm empty state when no one is visible', () => {
    const { fixture, el } = create();
    expectApi(http, '/posts/p1/likes').flush({ users: [] });
    fixture.detectChanges();

    // The count can be non-zero while every liker is block-hidden — never a blank dialog.
    expect(el.textContent).toContain('No likes to show.');
  });

  it('shows the error and still allows closing', () => {
    const { fixture, el } = create();
    expectApi(http, '/posts/p1/likes').flush(
      [{ code: 'Server.Error', description: 'Could not load likes.', type: 'Unexpected' }],
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Could not load likes.');
    el.querySelector<HTMLButtonElement>('.actions button')!.click();
    fixture.detectChanges();
    expect(el.querySelector('dialog')?.hasAttribute('open')).toBe(false);
  });
});
