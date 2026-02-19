export type OrgRole = 'basic' | 'mid' | 'admin' | 'super_admin';

export type VenueRole = 'basic' | 'mid' | 'admin' | 'super_admin';

export type UserStatus = 'active' | 'suspended' | 'deactivated';

export interface User {
  id: string;
  phone: string;
  email: string;
  fullName: string;
  address: string;
  positionId: string;
  timezone: string;
  orgRole: OrgRole;
  status: UserStatus;
  signupAt: string;
  profileCompletedAt: string | null;
  quietHoursEnabled: boolean;
  failedOtpAttempts: number;
  lockedUntil: string | null;
}

/** Public-facing user info visible to non-admins. */
export interface UserPublic {
  id: string;
  fullName: string;
  position: string;
  timezone: string;
  orgRole: OrgRole;
  status: UserStatus;
}

export interface UserVenue {
  userId: string;
  venueId: string;
  venueRole: VenueRole;
  joinedAt: string;
}

export interface CreateInviteInput {
  phone: string;
  orgRole: OrgRole;
  venueAssignments: Array<{
    venueId: string;
    venueRole: VenueRole;
  }>;
}

export interface CompleteOnboardingInput {
  fullName: string;
  email: string;
  address: string;
  positionId: string;
  timezone: string;
}

export interface UpdateProfileInput {
  fullName?: string;
  email?: string;
  address?: string;
  positionId?: string;
  timezone?: string;
  quietHoursEnabled?: boolean;
}
