import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BlockedMuted } from './blocked-muted';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const theo = {
  userId: 'u1',
  username: 'theo',
  displayName: 'Theo Alvarez',
  isVerified: true,
  isFollowedByViewer: false,
};

const june = {
  userId: 'u2',
  username: 'june',
  displayName: 'June Park',
  isVerified: true,
  isFollowedByViewer: false,
};

describe('Blocks & mutes settings', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([BlockedMuted]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(BlockedMuted);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function load(
    fixture: ComponentFixture<BlockedMuted>,
    blocks: object[],
    mutes: object[],
  ) {
    expectApi(http, '/users/me/blocks').flush({ users: blocks });
    expectApi(http, '/users/me/mutes').flush({ users: mutes });
    fixture.detectChanges();
  }

  it('lists blocked and muted people with separate counts', () => {
    const { fixture, el } = create();
    load(fixture, [theo], [june]);

    expect(el.querySelector('#blocked-h')?.textContent).toContain('1');
    expect(el.querySelector('#muted-h')?.textContent).toContain('1');
    expect(el.textContent).toContain('Theo Alvarez');
    expect(el.textContent).toContain('@theo');
    expect(el.textContent).toContain('June Park');
    expect(el.textContent).toContain('@june');
  });

  it('unblocks from the list and removes the row without a reload', () => {
    const { fixture, el } = create();
    load(fixture, [theo], []);

    el.querySelector<HTMLButtonElement>('button[aria-label="Unblock @theo"]')!.click();
    expectApi(http, '/users/theo/block').flush(null);
    fixture.detectChanges();

    expect(el.textContent).not.toContain('Theo Alvarez');
    expect(el.textContent).toContain('You haven\'t blocked anyone.');
    expect(el.textContent).toContain('Unblocked @theo.');
  });

  it('unmutes from the list and leaves the blocked section alone', () => {
    const { fixture, el } = create();
    load(fixture, [theo], [june]);

    el.querySelector<HTMLButtonElement>('button[aria-label="Unmute @june"]')!.click();
    expectApi(http, '/users/june/mute').flush(null);
    fixture.detectChanges();

    expect(el.textContent).not.toContain('June Park');
    expect(el.textContent).toContain('Theo Alvarez');
    expect(el.textContent).toContain('Unmuted @june.');
  });

  it('shows calm empty states when both lists are empty', () => {
    const { fixture, el } = create();
    load(fixture, [], []);

    expect(el.textContent).toContain('You haven\'t blocked anyone.');
    expect(el.textContent).toContain('You haven\'t muted anyone.');
  });

  it('shows a retry path when either list fails to load', () => {
    const { fixture, el } = create();
    // Complete the healthy request first; forkJoin unsubscribes the other one on error,
    // and flushing a cancelled request is not something a real browser does.
    expectApi(http, '/users/me/mutes').flush({ users: [] });
    expectApi(http, '/users/me/blocks').flush(
      [{ code: 'Server.Error', description: 'Could not load your lists.', type: 'Unexpected' }],
      { status: 500, statusText: 'Server Error' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Could not load your lists.');
    el.querySelector<HTMLButtonElement>('.retry')!.click();
    expectApi(http, '/users/me/blocks').flush({ users: [theo] });
    expectApi(http, '/users/me/mutes').flush({ users: [] });
    fixture.detectChanges();

    expect(el.textContent).toContain('Theo Alvarez');
  });
});
