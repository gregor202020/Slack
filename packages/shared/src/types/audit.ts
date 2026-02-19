export type AuditActorType = 'user' | 'api_key' | 'system';

/**
 * All auditable actions from spec Section 16.3.
 */
export type AuditAction =
  // Authentication
  | 'auth.login_success'
  | 'auth.login_failure'
  | 'auth.logout'
  | 'auth.force_logout'
  | 'auth.otp_request_success'
  | 'auth.otp_request_failure'
  | 'auth.otp_verify_failure'
  | 'auth.account_lockout'
  // User management
  | 'user.invite_sent'
  | 'user.account_created'
  | 'user.profile_updated'
  | 'user.suspended'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.role_changed'
  | 'user.timezone_changed'
  // Sensitive data access
  | 'user.sensitive_data_viewed'
  | 'user.sensitive_data_edited'
  // Super admin DM access
  | 'dm.super_admin_viewed'
  // Channels
  | 'channel.created'
  | 'channel.archived'
  | 'channel.unarchived'
  | 'channel.deleted'
  | 'channel.member_added'
  | 'channel.member_removed'
  | 'channel.settings_changed'
  // Messages
  | 'message.super_admin_deleted'
  | 'message.bulk_delete'
  // Vault access
  | 'vault.searched'
  | 'vault.exported'
  | 'vault.early_purge'
  // Announcements
  | 'announcement.created'
  | 'announcement.escalation_triggered'
  // API keys
  | 'api_key.created'
  | 'api_key.rotated'
  | 'api_key.revoked'
  | 'api_key.scope_changed'
  | 'api_key.action_performed'
  // Data exports
  | 'export.initiated'
  // Roles
  | 'role.assigned'
  | 'role.changed'
  // Venues
  | 'venue.created'
  | 'venue.archived'
  | 'venue.unarchived'
  | 'venue.member_added'
  | 'venue.member_removed'
  // Shift swaps
  | 'shift_swap.requested'
  | 'shift_swap.accepted'
  | 'shift_swap.declined'
  | 'shift_swap.overridden'
  | 'shift_swap.expired'
  // Group DM dissolution
  | 'dm.dissolved';

export interface AuditLog {
  id: string;
  actorId: string;
  actorType: AuditActorType;
  action: AuditAction;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string;
  userAgent: string;
  prevHash: string | null;
  createdAt: string;
}
