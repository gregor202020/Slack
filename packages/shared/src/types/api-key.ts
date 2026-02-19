export type ApiKeyScope =
  | 'channels:read'
  | 'channels:write'
  | 'channels:delete'
  | 'venues:read'
  | 'venues:write'
  | 'venues:delete'
  | 'messages:read'
  | 'messages:write'
  | 'messages:delete'
  | 'users:read'
  | 'shifts:read'
  | 'shifts:write'
  | 'maintenance:read'
  | 'maintenance:write'
  | 'announcements:read'
  | 'files:read'
  | 'files:write';

export interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  scopes: ApiKeyScope[];
  ipAllowlist: string[] | null;
  rateLimit: number;
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreateApiKeyInput {
  name: string;
  scopes: ApiKeyScope[];
  ipAllowlist?: string[];
  rateLimit?: number;
}
