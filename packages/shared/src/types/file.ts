export interface FileRecord {
  id: string;
  userId: string;
  channelId: string | null;
  dmId: string | null;
  messageId: string | null;
  originalFilename: string;
  sanitizedFilename: string;
  mimeType: string;
  sizeBytes: number;
  s3Key: string;
  createdAt: string;
}

export interface UploadFileInput {
  channelId?: string;
  dmId?: string;
  messageId?: string;
  originalFilename: string;
}
