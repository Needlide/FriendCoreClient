import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { Notifications } from './notifications';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

const list = {
  notifications: [
    {
      id: 'n1',
      type: 'NewFollower',
      actor: { userId: 'u1', username: 'bob', displayName: 'Bob', isVerified: false },
      entityId: 'u1',
      isRead: false,
      createdAt: new Date().toISOString(),
    },
  ],
};

describe('Notifications', () => {
  let http: HttpTestingController;
  const pushes = new Subject<{ type: string }>();

  beforeEach(async () => {
    await configureAuthTestBed([Notifications]);
    // Drive pushes manually: the page must refetch the hydrated list per event.
    TestBed.overrideProvider(RealtimeService, {
      useValue: { notification$: pushes.asObservable(), resync$: new Subject().asObservable() },
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Notifications);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('renders hydrated text from REST, not the skinny push', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();
    expect(el.textContent).toContain('Bob started following you');
  });

  it('refetches the list on every push', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();

    pushes.next({ type: 'NewLike' });
    expectApi(http, '/notifications').flush({ notifications: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing new');
  });

  it('marks all read in one call and clears the flags locally', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush(list);
    fixture.detectChanges();
    expect(el.querySelector('.row.unread')).not.toBeNull();

    el.querySelector<HTMLButtonElement>('.head button')!.click();
    expectApi(http, '/notifications/read').flush(null);
    fixture.detectChanges();
    expect(el.querySelector('.row.unread')).toBeNull();
  });

  it('shows the calm empty state with no notifications', () => {
    const { fixture, el } = create();
    expectApi(http, '/notifications').flush({ notifications: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Nothing new');
  });
});
