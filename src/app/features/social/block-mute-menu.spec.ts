import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BlockMuteMenu } from './block-mute-menu';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

/**
 * The block contract under test: POST with NO body first; only a 409
 * `User.BlockRequiresConfirmation` earns the confirm dialog, and the resend
 * carries `{confirmed: true}`. The client never pre-checks follow state.
 */
describe('BlockMuteMenu', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([BlockMuteMenu]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(BlockMuteMenu);
    fixture.componentRef.setInput('username', 'bob');
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function menuButton(el: HTMLElement, text: string): HTMLButtonElement {
    const button = Array.from(el.querySelectorAll('.items button')).find((b) =>
      b.textContent?.includes(text),
    ) as HTMLButtonElement | undefined;
    if (!button) throw new Error(`menu item "${text}" not found`);
    return button;
  }

  it('blocks immediately with an empty body when no follow relationship exists', () => {
    const { fixture, el } = create();
    const emitted: string[] = [];
    fixture.componentInstance.blocked.subscribe((u) => emitted.push(u));
    menuButton(el, 'Block').click();

    const req = expectApi(http, '/users/bob/block');
    expect(req.request.method).toBe('POST');
    req.flush(null);
    expect(emitted).toEqual(['bob']);
  });

  it('asks for confirmation on 409 and resends with confirmed=true', () => {
    const { fixture, el } = create();
    menuButton(el, 'Block').click();
    expectApi(http, '/users/bob/block').flush(
      [{ code: 'User.BlockRequiresConfirmation', description: 'Confirm.' }],
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Block @bob?');
    el.querySelector<HTMLButtonElement>('.confirm-actions .fc-danger')!.click();
    const retry = expectApi(http, '/users/bob/block');
    expect(retry.request.body).toEqual({ confirmed: true });
    retry.flush(null);
  });

  it('cancelling the confirm sends nothing more', () => {
    const { fixture, el } = create();
    menuButton(el, 'Block').click();
    expectApi(http, '/users/bob/block').flush(
      [{ code: 'User.BlockRequiresConfirmation', description: 'Confirm.' }],
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>('.confirm-actions .fc-secondary')!.click();
    fixture.detectChanges();
    expect(el.querySelector('.confirm')).toBeNull();
  });

  it('shows the server message when the account cannot be blocked', () => {
    const { fixture, el } = create();
    menuButton(el, 'Block').click();
    expectApi(http, '/users/bob/block').flush(
      [{ code: 'User.CannotBlockAdmin', description: 'This account cannot be blocked.' }],
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'This account cannot be blocked.',
    );
  });

  it('mutes silently and offers unmute afterwards', () => {
    const { fixture, el } = create();
    menuButton(el, 'Mute').click();
    expectApi(http, '/users/bob/mute').flush(null);
    fixture.detectChanges();
    expect(menuButton(el, 'Unmute')).not.toBeNull();
  });
});
