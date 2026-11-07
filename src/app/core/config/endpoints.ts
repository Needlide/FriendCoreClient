/** Auth routes, relative to /api/v1 (used with ApiClient). */
export const AuthEndpoints = {
  register: '/auth/register',
  login: '/auth/login',
  verifyEmail: '/auth/verify-email',
  refresh: '/auth/refresh',
  logout: '/auth/logout',
  resendVerification: '/auth/resend-verification',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
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
  blocks: '/users/me/blocks',
  mutes: '/users/me/mutes',
  preferences: '/users/me/preferences',
  keywordFilters: '/users/me/keyword-filters',
  notificationTypes: '/users/me/notification-types',
  snooze: '/users/me/snooze',
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
  likes: (id: string) => `/posts/${id}/likes`,
  comments: (id: string) => `/posts/${id}/comments`,
} as const;

export const CommentsEndpoints = {
  byId: (id: string) => `/comments/${id}`,
} as const;

/** Media routes, relative to /api/v1. */
export const MediaEndpoints = {
  media: '/media',
  status: (id: string) => `/media/${id}/status`,
  byId: (id: string) => `/media/${id}`,
  /** Consent step for flagged media (§7.4): the variant URLs, once the server has authorized
   *  this reader. POST, not GET, so no prefetcher hands out the URLs before consent. */
  revealMedia: (id: string) => `/media/${id}/reveal`,
} as const;

/** Notification routes, relative to /api/v1. */
export const NotificationsEndpoints = {
  list: '/notifications',
  unreadCount: '/notifications/unread-count',
  markRead: '/notifications/read',
  byId: (id: string) => `/notifications/${id}`,
  markReadById: (id: string) => `/notifications/${id}/read`,
} as const;

/** Conversation routes, relative to /api/v1. */
export const ConversationsEndpoints = {
  list: '/conversations',
  /** Find-or-create a 1:1 by username. */
  start: '/conversations',
  /** Find-or-create the 1:1 with the admin support inbox (no body). */
  support: '/conversations/support',
  messages: (id: string) => `/conversations/${id}/messages`,
  /** Substring search over one conversation. Separate from `messages` so it is never routed to. */
  search: (id: string) => `/conversations/${id}/messages/search`,
  /** A two-way window around one message, for jumping to a search result. */
  around: (conversationId: string, messageId: string) =>
    `/conversations/${conversationId}/messages/${messageId}/around`,
  /** Scoped by conversation so a guessed message id is a 404, not a cross-thread write. */
  message: (conversationId: string, messageId: string) =>
    `/conversations/${conversationId}/messages/${messageId}`,
  /** Toggles the caller's reaction. The emoji rides in the body, not the path: a glyph in a
   *  route segment would arrive percent-encoded, and every proxy in between gets a vote on
   *  whether it decodes cleanly. */
  reactions: (conversationId: string, messageId: string) =>
    `/conversations/${conversationId}/messages/${messageId}/reactions`,
  reportMessage: (conversationId: string, messageId: string) =>
    `/conversations/${conversationId}/messages/${messageId}/report`,
  markRead: (id: string) => `/conversations/${id}/read`,
} as const;

/** Moderation user-facing routes, relative to /api/v1. */
export const ModerationEndpoints = {
  myActions: '/users/me/moderation-actions',
  appeals: '/appeals',
  reportPost: (id: string) => `/posts/${id}/report`,
  /** §13.4 categories. Replaces the old {flashing,intenseMotion} safety-only endpoint,
   *  which gated the media but created no Report — so no moderator ever saw it. */
  reportMedia: (id: string) => `/media/${id}/report`,
} as const;

/** Admin moderation routes, relative to /api/v1. All require Moderator+ (some stricter).
 *  These are server-gated — the client just calls them and handles 403. */
export const AdminEndpoints = {
  metrics: '/admin/metrics',
  reports: '/admin/reports',
  reportById: (id: string) => `/admin/reports/${id}`,
  resolveReport: (id: string) => `/admin/reports/${id}/resolve`,
  appeals: '/admin/appeals',
  reviewAppeal: (id: string) => `/admin/appeals/${id}/review`,
  userAccount: (username: string) => `/admin/users/${username}`,
  actOnUser: (username: string) => `/admin/users/${username}/action`,
  changeUserRole: (username: string) => `/admin/users/${username}/role`,
  auditLog: '/admin/audit-log',
  /** Tag moderation lives under /tags (TagModeration policy), not /admin. */
  tagQueue: '/tags/moderation/queue',
  moderateTag: (id: string) => `/tags/${id}/moderation`,
} as const;
