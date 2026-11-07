import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { CommentsEndpoints, FeedEndpoints, PostsEndpoints } from '../../core/config/endpoints';
import {
  CommentFeedResponse,
  CreatePostRequest,
  LikeListResponse,
  Post,
  PostComment,
  PostFeedResponse,
} from '../../core/models/posts.models';

/**
 * Feed + post transport. Pagination state lives in the feed component (cursor in,
 * append out); this just speaks HTTP. Like/unlike return 204 — the component flips
 * `isLikedByCurrentUser`/`likeCount` optimistically and rolls back on error.
 */
@Injectable({ providedIn: 'root' })
export class FeedService {
  private readonly api = inject(ApiClient);

  /** GET /feed/home — cursor omitted for the first page. */
  getHome(cursor?: string | null): Observable<PostFeedResponse> {
    return this.api.get<PostFeedResponse>(FeedEndpoints.home, {
      params: cursor ? { cursor } : {},
    });
  }

  createPost(request: CreatePostRequest): Observable<Post> {
    return this.api.post<Post>(PostsEndpoints.posts, request);
  }

  like(id: string): Observable<void> {
    return this.api.post<void>(PostsEndpoints.like(id));
  }

  unlike(id: string): Observable<void> {
    return this.api.delete<void>(PostsEndpoints.like(id));
  }

  deletePost(id: string): Observable<void> {
    return this.api.delete<void>(PostsEndpoints.byId(id));
  }

  getPost(id: string): Observable<Post> {
    return this.api.get<Post>(PostsEndpoints.byId(id));
  }

  /** Who liked a post, newest first. Anonymous-readable, like the post itself. */
  getLikes(postId: string): Observable<LikeListResponse> {
    return this.api.get<LikeListResponse>(PostsEndpoints.likes(postId));
  }

  getComments(postId: string, cursor?: string | null): Observable<CommentFeedResponse> {
    return this.api.get<CommentFeedResponse>(PostsEndpoints.comments(postId), {
      params: cursor ? { cursor } : {},
    });
  }

  addComment(postId: string, content: string): Observable<PostComment> {
    return this.api.post<PostComment>(PostsEndpoints.comments(postId), { content });
  }

  deleteComment(commentId: string): Observable<void> {
    return this.api.delete<void>(CommentsEndpoints.byId(commentId));
  }
}
