export type ShiftSwapStatus = 'pending' | 'accepted' | 'declined' | 'overridden' | 'expired';

export interface Shift {
  id: string;
  venueId: string;
  userId: string;
  startTime: string;
  endTime: string;
  roleLabel: string | null;
  notes: string | null;
  externalId: string | null;
  version: number;
  lockedBySwapId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftSwap {
  id: string;
  shiftId: string;
  requesterUserId: string;
  targetUserId: string;
  targetShiftId: string;
  status: ShiftSwapStatus;
  createdAt: string;
  resolvedAt: string | null;
  expiresAt: string;
}

export interface CreateShiftInput {
  venueId: string;
  userId: string;
  startTime: string;
  endTime: string;
  roleLabel?: string;
  notes?: string;
}

export interface RequestSwapInput {
  shiftId: string;
  targetUserId: string;
  targetShiftId: string;
}
