export interface Message {
  id: string;
  channelId: string | null;
  dmId: string | null;
  userId: string;
  parentMessageId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface MessageVersion {
  id: string;
  messageId: string;
  body: string;
  editedAt: string;
  editedBy: string;
}

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface SendMessageInput {
  channelId?: string;
  dmId?: string;
  parentMessageId?: string;
  body: string;
}

export interface EditMessageInput {
  body: string;
}
