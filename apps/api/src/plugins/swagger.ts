/**
 * Swagger/OpenAPI plugin — registers @fastify/swagger and @fastify/swagger-ui.
 *
 * Provides interactive API documentation at /docs.
 */

import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'The Smoker API',
        version: '1.0.0',
        description:
          'Internal communications platform API — channels, DMs, messaging, shifts, announcements, and administration.',
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT access token obtained from POST /api/auth/verify',
          },
        },
      },
      security: [{ BearerAuth: [] }],
      tags: [
        { name: 'Auth', description: 'Authentication — OTP, token refresh, logout' },
        { name: 'Invites', description: 'User invitation management' },
        { name: 'Onboarding', description: 'New user onboarding flow' },
        { name: 'Users', description: 'User profiles, preferences, and admin actions' },
        { name: 'Venues', description: 'Venue CRUD, membership, and positions' },
        { name: 'Channels', description: 'Channel CRUD, membership, pins, and settings' },
        { name: 'DMs', description: 'Direct messages and group DMs' },
        { name: 'Messages', description: 'Send, edit, delete messages and threads' },
        { name: 'Reactions', description: 'Emoji reactions on messages' },
        { name: 'Files', description: 'File upload, download, and management' },
        { name: 'Search', description: 'Full-text search across messages, channels, users' },
        { name: 'Canvas', description: 'Collaborative Canvas documents (Yjs-based)' },
        { name: 'Announcements', description: 'System/venue announcements with acknowledgements' },
        { name: 'Shifts', description: 'Shift scheduling and swap workflows' },
        { name: 'Notifications', description: 'Push notification device management' },
        { name: 'Bookmarks', description: 'Personal message bookmarks' },
        { name: 'Unread', description: 'Unread message counts and read receipts' },
        { name: 'Admin', description: 'Admin operations — bulk delete, audit logs, export, vault' },
        { name: 'API Keys', description: 'API key management for integrations' },
        { name: 'Maintenance', description: 'Venue maintenance requests and comments' },
      ],
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
  });
}
