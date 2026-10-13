import { Injectable, inject, signal } from '@angular/core';
import {
  HubConnection,
  HubConnectionBuilder,
  IHttpConnectionOptions,
  LogLevel,
} from '@microsoft/signalr';
import { Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { resolveApiBaseUrl } from '../config/api-base-url';
import { AuthService } from '../auth/auth.service';
import { RealtimeHubs } from '../config/endpoints';
import {
  HubName,
  MESSAGE_DELETED_EVENT,
  MESSAGE_EDITED_EVENT,
  MESSAGE_EVENT,
  MESSAGE_REACTION_EVENT,
  MessageDeletedPayload,
  MessageReactionChangedPayload,
  MessageResponse,
  NOTIFICATION_EVENT,
  RealtimeNotification,
  RealtimeState,
} from '../models/realtime.models';

/** Backoff schedule (ms) for the INITIAL connect; drops after a good connect use withAutomaticReconnect. */
const INITIAL_RETRY_DELAYS_MS = [0, 2_000, 5_000, 10_000, 30_000];

/**
 * Owns both push-only SignalR hubs. Open after login, tear down on logout.
 *
 * Design rules from the integration guide §3:
 *  - Auth rides as `?access_token=` (the server lifts it for /hubs paths only). With
 *    `@microsoft/signalr` we supply {@link AuthService.freshAccessToken} as the
 *    accessTokenFactory; it's re-invoked on every (re)connect and MUST return a fresh
 *    token or the reconnect 401s — it routes through the single-flight refresh.
 *  - Push is best-effort and skinny (IDs + type only). Treat every event — and every
 *    (re)connect (`resync$`) — as a "reconcile via REST now" trigger; never rely on the
 *    push payload alone for state.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);

  private notifications?: HubConnection;
  private messaging?: HubConnection;
  private starting = false;

  private readonly notificationSubject = new Subject<RealtimeNotification>();
  private readonly messageSubject = new Subject<MessageResponse>();
  private readonly messageEditedSubject = new Subject<MessageResponse>();
  private readonly messageDeletedSubject = new Subject<MessageDeletedPayload>();
  private readonly messageReactionSubject = new Subject<MessageReactionChangedPayload>();
  private readonly resyncSubject = new Subject<HubName>();

  /** A new realtime notification arrived (bump the badge; reconcile via GET /notifications). */
  readonly notification$ = this.notificationSubject.asObservable();
  /** A DM arrived for the recipient (reconcile via GET the conversation's messages). */
  readonly message$ = this.messageSubject.asObservable();
  /**
   * A message was rewritten. Carries the full message (not just an id), so the open thread can
   * apply it directly instead of refetching a page to change one word.
   */
  readonly messageEdited$ = this.messageEditedSubject.asObservable();
  /** A message was soft-deleted. Drop it from the thread; there is no tombstone to render. */
  readonly messageDeleted$ = this.messageDeletedSubject.asObservable();
  /**
   * A reaction was added or taken back. Carries the emoji's whole new state (count 0 = drop
   * the chip), so an open thread moves one chip rather than refetching a page for it.
   */
  readonly messageReaction$ = this.messageReactionSubject.asObservable();
  /** A hub (re)connected — reconcile the relevant REST resource to catch missed pushes. */
  readonly resync$ = this.resyncSubject.asObservable();

  private readonly _state = signal<RealtimeState>('disconnected');
  readonly state = this._state.asReadonly();

  /** Builds and starts both hubs. Safe to call repeatedly (no-op if already up). */
  async connect(): Promise<void> {
    if (this.starting || this.notifications || this.messaging) return;
    this.starting = true;
    this._state.set('connecting');

    this.notifications = this.build(RealtimeHubs.notifications, 'notifications');
    this.messaging = this.build(RealtimeHubs.messaging, 'messaging');

    this.notifications.on(NOTIFICATION_EVENT, (n: RealtimeNotification) =>
      this.notificationSubject.next(n),
    );
    this.messaging.on(MESSAGE_EVENT, (m: MessageResponse) => this.messageSubject.next(m));
    this.messaging.on(MESSAGE_EDITED_EVENT, (m: MessageResponse) =>
      this.messageEditedSubject.next(m),
    );
    this.messaging.on(MESSAGE_DELETED_EVENT, (p: MessageDeletedPayload) =>
      this.messageDeletedSubject.next(p),
    );
    this.messaging.on(MESSAGE_REACTION_EVENT, (p: MessageReactionChangedPayload) =>
      this.messageReactionSubject.next(p),
    );

    await Promise.all([
      this.startWithRetry(this.notifications, 'notifications'),
      this.startWithRetry(this.messaging, 'messaging'),
    ]);
    this.starting = false;
  }

  /** Stops both hubs and resets state. Call on logout. */
  async disconnect(): Promise<void> {
    const connections = [this.notifications, this.messaging].filter((c): c is HubConnection => !!c);
    this.notifications = undefined;
    this.messaging = undefined;
    this._state.set('disconnected');
    await Promise.all(connections.map((c) => c.stop().catch(() => void 0)));
  }

  private build(path: string, name: HubName): HubConnection {
    const options: IHttpConnectionOptions = {
      accessTokenFactory: () => this.auth.freshAccessToken(),
      withCredentials: true,
    };

    const connection = new HubConnectionBuilder()
      // Same origin as the page in a same-origin build, so one build works from any address
      // the testers happen to use. Absolute either way — SignalR must negotiate a real origin.
      .withUrl(resolveApiBaseUrl() + path, options)
      .withAutomaticReconnect()
      .configureLogging(environment.production ? LogLevel.Error : LogLevel.Information)
      .build();

    connection.onreconnecting(() => this._state.set('reconnecting'));
    connection.onreconnected(() => {
      this._state.set('connected');
      this.resyncSubject.next(name); // reconcile after any gap
    });
    connection.onclose(() => this.refreshAggregateState());

    return connection;
  }

  private async startWithRetry(connection: HubConnection, name: HubName): Promise<void> {
    for (const delay of INITIAL_RETRY_DELAYS_MS) {
      // Bail if a disconnect() happened while we were waiting/retrying.
      if (connection !== this.connectionFor(name)) return;
      if (delay > 0) await wait(delay);
      try {
        await connection.start();
        this._state.set('connected');
        this.resyncSubject.next(name); // reconcile on the very first connect too
        return;
      } catch {
        // try the next backoff step
      }
    }
  }

  private connectionFor(name: HubName): HubConnection | undefined {
    return name === 'notifications' ? this.notifications : this.messaging;
  }

  private refreshAggregateState(): void {
    if (!this.notifications && !this.messaging) this._state.set('disconnected');
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
