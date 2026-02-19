export type ChannelType = 'public' | 'private';

export type ChannelScope = 'org' | 'venue';

export type ChannelStatus = 'active' | 'archived';

export type NotificationPref = 'all' | 'mentions' | 'muted';

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  scope: ChannelScope;
  venueId: string | null;
  ownerUserId: string;
  isDefault: boolean;
  isMandatory: boolean;
  status: ChannelStatus;
  createdAt: string;
}

export interface ChannelMember {
  channelId: string;
  userId: string;
  notificationPref: NotificationPref;
  joinedAt: string;
}

export interface CreateChannelInput {
  name: string;
  type: ChannelType;
  scope: ChannelScope;
  venueId?: string;
}

export interface UpdateChannelInput {
  name?: string;
  topic?: string;
  isDefault?: boolean;
  isMandatory?: boolean;
}
