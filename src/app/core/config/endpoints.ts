/** Auth routes, relative to /api/v1 (used with ApiClient). */
export const AuthEndpoints = {
  register: '/auth/register',
  login: '/auth/login',
  verifyEmail: '/auth/verify-email',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  resendVerification: '/auth/resend-verification',
} as const;

/**
 * SignalR hub paths. These live at the server root (NOT under /api/v1), so build them
 * from `apiBaseUrl` directly, e.g. `${apiBaseUrl}/hubs/notifications`.
 */
export const RealtimeHubs = {
  notifications: '/hubs/notifications',
  messaging: '/hubs/messaging',
} as const;

/** Tag routes, relative to /api/v1. */
export const TagsEndpoints = {
  autocomplete: '/tags/autocomplete',
} as const;

/** User routes, relative to /api/v1. `{username}` is interpolated by the caller. */
export const UsersEndpoints = {
  profileTags: '/users/me/tags',
  updateProfile: '/users/me/profile',
  preferences: '/users/me/preferences',
  keywordFilters: '/users/me/keyword-filters',
  profile: (username: string) => `/users/${username}`,
  userPosts: (username: string) => `/users/${username}/posts`,
  followers: (username: string) => `/users/${username}/followers`,
  following: (username: string) => `/users/${username}/following`,
  follow: (username: string) => `/users/${username}/follow`,
  block: (username: string) => `/users/${username}/block`,
  mute: (username: string) => `/users/${username}/mute`,
  reportUser: (username: string) => `/users/${username}/report`,
} as const;

/** Discovery routes, relative to /api/v1. */
export const DiscoveryEndpoints = {
  people: '/feed/discovery/people',
  posts: '/feed/discovery/posts',
} as const;

/** Feed + post routes, relative to /api/v1. */
export const FeedEndpoints = {
  home: '/feed/home',
} as const;

export const PostsEndpoints = {
  posts: '/posts',
  byId: (id: string) => `/posts/${id}`,
  like: (id: string) => `/posts/${id}/like`,
} as const;

/** Media routes, relative to /api/v1. */
export const MediaEndpoints = {
  media: '/media',
  status: (id: string) => `/media/${id}/status`,
  byId: (id: string) => `/media/${id}`,
} as const;

/** Notification routes, relative to /api/v1. */
export const NotificationsEndpoints = {
  list: '/notifications',
  unreadCount: '/notifications/unread-count',
  markRead: '/notifications/read',
} as const;

/** Conversation routes, relative to /api/v1. */
export const ConversationsEndpoints = {
  list: '/conversations',
  /** Find-or-create a 1:1 by username. */
  start: '/conversations',
  /** Find-or-create the 1:1 with the admin support inbox (no body). */
  support: '/conversations/support',
  messages: (id: string) => `/conversations/${id}/messages`,
  markRead: (id: string) => `/conversations/${id}/read`,
} as const;

/** Moderation user-facing routes, relative to /api/v1. */
export const ModerationEndpoints = {
  myActions: '/users/me/moderation-actions',
  appeals: '/appeals',
  reportPost: (id: string) => `/posts/${id}/report`,
  reportMedia: (id: string) => `/media/${id}/report-safety`,
} as const;
