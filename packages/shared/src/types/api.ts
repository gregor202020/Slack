export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface CursorPaginationParams {
  cursor?: string;
  limit?: number;
}
