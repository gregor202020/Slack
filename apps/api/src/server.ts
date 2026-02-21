/**
 * Main entry point for the Smoker API server.
 *
 * - Loads environment variables via dotenv
 * - Initializes config
 * - Builds the Fastify app
 * - Initializes Socket.io on the same server
 * - Starts listening on PORT
 * - Handles graceful shutdown (SIGTERM, SIGINT)
 * - Installs global error handlers for unhandled rejections / uncaught exceptions
 */

import 'dotenv/config'
import { loadConfig } from './lib/config.js'
import { buildApp } from './app.js'
import { initializeSocketIO } from './plugins/socket.js'
import { initFirebase } from './plugins/firebase.js'
import { installGlobalErrorHandlers } from './lib/error-tracker.js'
import { closeRedis } from './lib/redis.js'

async function main(): Promise<void> {
  // Load and validate config first
  const config = loadConfig()

  // Build the Fastify app (initializes the structured logger)
  const app = await buildApp()

  // Initialize Firebase Admin SDK for push notifications
  // (must be after buildApp so the structured logger is available)
  initFirebase()

  // Warn if Twilio credentials are missing
  if (!config.twilioAccountSid || !config.twilioAuthToken || !config.twilioFromNumber) {
    app.log.warn('Twilio credentials not configured — SMS features (OTP, invites) will fail in production')
  }

  // Start listening
  await app.listen({ port: config.port, host: config.host })

  // Initialize Socket.io on the underlying HTTP server
  const httpServer = app.server
  initializeSocketIO(httpServer)

  app.log.info(`Server listening on ${config.host}:${config.port}`)
  app.log.info(`Environment: ${config.nodeEnv}`)
  app.log.info(`Log level: ${app.log.level}`)

  // --- Install global error handlers using the structured logger ---
  installGlobalErrorHandlers(app.log)

  // --- Graceful shutdown ---
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Received shutdown signal. Starting graceful shutdown...')

    try {
      // Close the Fastify server (stops accepting new connections)
      await app.close()
      await closeRedis()
      app.log.info('Server closed successfully')
      process.exit(0)
    } catch (err) {
      app.log.error(err, 'Error during shutdown')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err)
  process.exit(1)
})

// Export for testing
export { buildApp }
