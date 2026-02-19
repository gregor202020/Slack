export type VenueStatus = 'active' | 'archived';

export interface Venue {
  id: string;
  name: string;
  address: string;
  status: VenueStatus;
  createdBy: string;
  createdAt: string;
}

export interface CreateVenueInput {
  name: string;
  address: string;
}

export interface UpdateVenueInput {
  name?: string;
  address?: string;
}
