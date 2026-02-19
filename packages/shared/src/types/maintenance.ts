export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';

export type MaintenanceStatus = 'open' | 'in_progress' | 'done';

export interface MaintenanceRequest {
  id: string;
  venueId: string;
  userId: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceComment {
  id: string;
  requestId: string;
  userId: string;
  body: string;
  createdAt: string;
}

export interface CreateMaintenanceInput {
  venueId: string;
  title: string;
  description: string;
  priority: MaintenancePriority;
}
