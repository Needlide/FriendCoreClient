import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ApiError } from '../../core/models/api-error';
import { Post } from '../../core/models/posts.models';
import { UserProfile, UserSummary } from '../../core/models/profile.models';
import { AuthError } from '../auth/ui/auth-error';
import { PostCard } from '../feed/post-card';
import { BlockMuteMenu } from '../social/block-mute-menu';
import { FollowButton } from '../social/follow-button';
import { UserCard } from '../social/user-card';
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
 *    reuses this component instance, so we reload on every param change.
 *  - 404 copy is identical for missing and blocked profiles (anti-enumeration —
 *    content-and-a11y.md §3). After YOU block them here, we navigate home: their
 *    profile 404s for you from that moment, so staying would show a confusing
 *    "not found" for someone you just saw.
 */
@Component({
  selector: 'fc-profile',
  imports: [RouterLink, PostCard, FollowButton, BlockMuteMenu, UserCard, AuthError],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile {
  private readonly profiles = inject(ProfileService);
  private readonly messaging = inject(MessagingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
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

  constructor() {
    // Same component instance serves every /u/:username — reload per navigation.
    this.route.paramMap.subscribe((params) => {
      const username = params.get('username');
      if (username) this.load(username);
    });
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
    this.profiles.getPosts(username, cursor).subscribe({
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
    this.messaging.start(username).subscribe({
      next: (conversation) => void this.router.navigate(['/messages', conversation.id]),
      error: () => undefined,
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
    const username = this.profile()?.username ?? this.route.snapshot.paramMap.get('username');
    if (username) {
      this.error.set(null);
      this.notFound.set(false);
      this.load(username);
    }
  }

  private load(username: string): void {
    this.loading.set(true);
    this.tab.set('posts');
    this.followers.set(null);
    this.following.set(null);
    this.profiles.getProfile(username).subscribe({
      next: (profile) => {
        this.profile.set(profile);
        this.loading.set(false);
        this.loadPosts(profile.username);
      },
      error: (err: unknown) => {
        this.loading.set(false);
        if (err instanceof ApiError && err.status === 404) this.notFound.set(true);
        else this.error.set(err instanceof ApiError ? err : null);
      },
    });
  }

  private loadPosts(username: string): void {
    this.profiles.getPosts(username).subscribe({
      next: (res) => {
        this.posts.set(res.posts);
        this.nextCursor.set(res.nextCursor);
      },
      error: () => undefined, // posts failing shouldn't nuke the whole header
    });
  }

  private loadFollowers(username: string): void {
    this.listsLoading.set(true);
    this.profiles.getFollowers(username).subscribe({
      next: (res) => {
        this.followers.set(res.users);
        this.listsLoading.set(false);
      },
      error: () => this.listsLoading.set(false),
    });
  }

  private loadFollowing(username: string): void {
    this.listsLoading.set(true);
    this.profiles.getFollowing(username).subscribe({
      next: (res) => {
        this.following.set(res.users);
        this.listsLoading.set(false);
      },
      error: () => this.listsLoading.set(false),
    });
  }
}
