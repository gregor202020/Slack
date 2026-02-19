export type AnnouncementScope = 'system' | 'venue' | 'channel';

export interface Announcement {
  id: string;
  userId: string;
  scope: AnnouncementScope;
  venueId: string | null;
  channelId: string | null;
  title: string;
  body: string;
  ackRequired: boolean;
  locked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementAck {
  id: string;
  announcementId: string;
  userId: string;
  ackedAt: string;
  sessionId: string;
}

export interface CreateAnnouncementInput {
  scope: AnnouncementScope;
  venueId?: string;
  channelId?: string;
  title: string;
  body: string;
  ackRequired: boolean;
}
