import { Post } from './posts.models';

/** GET /feed/discovery/posts — posts from tag-matched users you don't follow. */
export interface DiscoveryPostsResponse {
  posts: Post[];
}
