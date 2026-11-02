import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EMPTY, Observable, Subject, catchError, filter, map, merge, switchMap, tap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models/api-error';
import { Post } from '../../core/models/posts.models';
import { UserProfile, UserSummary } from '../../core/models/profile.models';
import { AuthError } from '../auth/ui/auth-error';
import { PostCard } from '../feed/post-card';
import { BlockMuteMenu } from '../social/block-mute-menu';
import { FollowButton } from '../social/follow-button';
import { UserCard } from '../social/user-card';
import { LinkifiedText } from '../shared/linkified-text';
import { MessagingService } from '../messaging/messaging.service';
import { ProfileService } from './profile.service';

type Tab = 'posts' | 'followers' | 'following';

/**
 * Profile (`/u/:username`, UI-Plan §1). One component, three concerns kept separate:
 *  - header: identity + own-vs-other actions;
 *  - posts: same cursor pagination as the home feed;
 *  - follower lists: fetched lazily on first tab open.
 *
 * Two behaviors worth understanding:
 *  - paramMap subscription (not snapshot): navigating from one profile to another
 *    reuses this component instance, so we reload on every param change. The load
 *    runs through switchMap so a slow earlier response can NEVER overwrite a newer
 *    one — without it, fast navigation shows page A's data while the URL says B.
 *  - 404 copy is identical for missing and blocked profiles (anti-enumeration —
 *    content-and-a11y.md §3). After YOU block them here, we navigate home: their
 *    profile 404s for you from that moment, so staying would show a confusing
 *    "not found" for someone you just saw.
 */
@Component({
  selector: 'fc-profile',
  imports: [RouterLink, PostCard, FollowButton, BlockMuteMenu, UserCard, AuthError, LinkifiedText],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  private readonly profiles = inject(ProfileService);
  private readonly messaging = inject(MessagingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);

  protected readonly loading = signal(true);
  protected readonly error = signal<ApiError | null>(null);
  protected readonly notFound = signal(false);
  protected readonly profile = signal<UserProfile | null>(null);
  protected readonly tab = signal<Tab>('posts');

  protected readonly posts = signal<Post[]>([]);
  protected readonly nextCursor = signal<string | null | undefined>(undefined);
  protected readonly loadingMore = signal(false);
  protected readonly followers = signal<UserSummary[] | null>(null);
  protected readonly following = signal<UserSummary[] | null>(null);
  protected readonly listsLoading = signal(false);
  protected readonly messageError = signal(false);

  /** Manual reload trigger, merged into the param stream (see the constructor). */
  private readonly reload$ = new Subject<void>();

  constructor() {
    // Same component instance serves every /u/:username — reload per navigation.
    //
    // switchMap (NOT mergeMap) is the whole point: it unsubscribes the previous
    // profile request the moment a new :username arrives, so a slow response for
    // the old user can never land after — and overwrite — the new one's data.
    // mergeMap would let both complete and the last one to arrive would win.
    merge(this.route.paramMap.pipe(map((params) => params.get('username'))), this.reload$)
      .pipe(
        filter((username): username is string => !!username),
        switchMap((username) => {
          this.reset();
          return this.load(username);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  /** True when viewing your own profile (usernames compare case-insensitively). */
  protected isSelf(): boolean {
    const me = this.auth.session()?.username;
    const them = this.profile()?.username;
    return !!me && !!them && me.toLowerCase() === them.toLowerCase();
  }

  protected initials(): string {
    const name = this.profile()?.displayName.trim() ?? '';
    return name.length > 0 ? name[0]!.toUpperCase() : '?';
  }

  protected switchTab(tab: Tab): void {
    if (tab === this.tab()) return;
    this.tab.set(tab);
    const username = this.profile()?.username;
    if (!username) return;
    if (tab === 'followers' && this.followers() === null) this.loadFollowers(username);
    if (tab === 'following' && this.following() === null) this.loadFollowing(username);
  }

  protected loadMore(): void {
    const username = this.profile()?.username;
    const cursor = this.nextCursor();
    if (!username || this.loadingMore() || cursor === null || cursor === undefined) return;
    this.loadingMore.set(true);
    this.profiles
      .getPosts(username, cursor)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          const seen = new Set(this.posts().map((p) => p.id));
          this.posts.update((posts) => [...posts, ...res.posts.filter((p) => !seen.has(p.id))]);
          this.nextCursor.set(res.nextCursor);
          this.loadingMore.set(false);
        },
        error: () => this.loadingMore.set(false),
      });
  }

  protected dropPost(id: string): void {
    this.posts.update((posts) => posts.filter((p) => p.id !== id));
  }

  /** Find-or-create the 1:1 and open it — the thread screen handles the rest. */
  protected message(): void {
    const username = this.profile()?.username;
    if (!username) return;
    this.messageError.set(false);
    this.messaging.start(username).subscribe({
      next: (conversation) => void this.router.navigate(['/messages', conversation.id]),
      error: () => this.messageError.set(true),
    });
  }

  protected dropBlocked(_username: string): void {
    // You just blocked them: their profile is now a 404 for you — go home.
    void this.router.navigate(['/']);
  }

  protected dropListed(username: string): void {
    this.followers.update((list) => list?.filter((u) => u.username !== username) ?? list);
    this.following.update((list) => list?.filter((u) => u.username !== username) ?? list);
  }

  protected retry(): void {
    this.error.set(null);
    this.notFound.set(false);
    this.reload$.next();
  }

  /**
   * Clears the previous user's data up front. Without this the new header would
   * render above the OLD user's posts (and a "Load more" bound to their cursor)
   * for the whole round trip between the profile response and the posts response.
   */
  private reset(): void {
    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);
    this.messageError.set(false);
    this.profile.set(null);
    this.tab.set('posts');
    this.posts.set([]);
    this.nextCursor.set(undefined);
    this.followers.set(null);
    this.following.set(null);
  }

  /**
   * Header + posts as ONE observable so switchMap can cancel the pair together.
   * The posts leg deliberately swallows its own errors: a failed post list must
   * not replace a perfectly good header with an error screen.
   */
  private load(username: string): Observable<unknown> {
    return this.profiles.getProfile(username).pipe(
      switchMap((profile) => {
        this.profile.set(profile);
        this.loading.set(false);
        return this.profiles.getPosts(profile.username).pipe(
          tap((res) => {
            this.posts.set(res.posts);
            this.nextCursor.set(res.nextCursor);
          }),
          catchError(() => EMPTY),
        );
      }),
      catchError((err: unknown) => {
        this.loading.set(false);
        if (err instanceof ApiError && err.status === 404) this.notFound.set(true);
        else this.error.set(err instanceof ApiError ? err : null);
        return EMPTY;
      }),
    );
  }

  private loadFollowers(username: string): void {
    this.listsLoading.set(true);
    this.profiles
      .getFollowers(username)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.followers.set(res.users);
          this.listsLoading.set(false);
        },
        error: () => this.listsLoading.set(false),
      });
  }

  private loadFollowing(username: string): void {
    this.listsLoading.set(true);
    this.profiles
      .getFollowing(username)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.following.set(res.users);
          this.listsLoading.set(false);
        },
        error: () => this.listsLoading.set(false),
      });
  }
}
