export type DmType = 'direct' | 'group';

export interface Dm {
  id: string;
  type: DmType;
  createdAt: string;
  dissolvedAt: string | null;
  dissolvedBy: string | null;
}

export interface DmMember {
  dmId: string;
  userId: string;
  joinedAt: string;
}

export interface CreateDmInput {
  type: DmType;
  memberUserIds: string[];
}
