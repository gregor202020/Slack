/**
 * Route registration — imports and registers all route modules under their prefixes.
 *
 * Each route file exports a Fastify plugin function.
 */

import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth/index.js';
import { inviteRoutes } from './invites/index.js';
import { userRoutes } from './users/index.js';
import { onboardingRoutes } from './onboarding/index.js';
import { venueRoutes } from './venues/index.js';
import { channelRoutes } from './channels/index.js';
import { dmRoutes } from './dms/index.js';
import { messageRoutes } from './messages/index.js';
import { reactionRoutes } from './reactions/index.js';
import { fileRoutes } from './files/index.js';
import { searchRoutes } from './search/index.js';
import { canvasRoutes } from './canvas/index.js';
import { announcementRoutes } from './announcements/index.js';
import { bulkDeleteRoutes } from './admin/bulk-delete/index.js';
import { auditLogRoutes } from './admin/audit-logs/index.js';
import { exportRoutes } from './admin/export/index.js';
import { vaultRoutes } from './admin/vault/index.js';
import { apiKeyRoutes } from './api-keys/index.js';
import { maintenanceRoutes } from './maintenance/index.js';
import { shiftRoutes } from './shifts/index.js';
import { notificationRoutes } from './notifications/index.js';
import { unreadRoutes } from './unread/index.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(inviteRoutes, { prefix: '/api/invites' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(onboardingRoutes, { prefix: '/api/onboarding' });
  await app.register(venueRoutes, { prefix: '/api/venues' });
  await app.register(channelRoutes, { prefix: '/api/channels' });
  await app.register(dmRoutes, { prefix: '/api/dms' });
  await app.register(messageRoutes, { prefix: '/api/messages' });
  await app.register(reactionRoutes, { prefix: '/api/reactions' });
  await app.register(fileRoutes, { prefix: '/api/files' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(canvasRoutes, { prefix: '/api/canvas' });
  await app.register(announcementRoutes, { prefix: '/api/announcements' });
  await app.register(bulkDeleteRoutes, { prefix: '/api/admin/bulk-delete' });
  await app.register(auditLogRoutes, { prefix: '/api/admin/audit-logs' });
  await app.register(exportRoutes, { prefix: '/api/admin/export' });
  await app.register(vaultRoutes, { prefix: '/api/admin/vault' });
  await app.register(apiKeyRoutes, { prefix: '/api/admin/api-keys' });
  await app.register(maintenanceRoutes, { prefix: '/api/maintenance' });
  await app.register(shiftRoutes, { prefix: '/api/shifts' });
  await app.register(notificationRoutes, { prefix: '/api/notifications' });
  await app.register(unreadRoutes, { prefix: '/api/unread' });
}
