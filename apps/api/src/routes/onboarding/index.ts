/**
 * Onboarding routes -- Complete user profile after invite acceptance.
 *
 * Spec references: Section 4.2, 18.2
 */

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middleware/auth.js'
import { validateBody } from '../../middleware/validate.js'
import { extractAuditContext } from '../../lib/audit.js'
import { completeOnboardingSchema } from '@smoker/shared'
import {
  getOnboardingStatus,
  completeOnboarding,
  listPositions,
  listVenuesForOnboarding,
} from '../../services/onboarding.service.js'

// Extend the shared schema with an optional venueId for onboarding
const completeOnboardingWithVenueSchema = completeOnboardingSchema.extend({
  venueId: z.string().uuid().optional(),
})

export async function onboardingRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/onboarding/status -- Check onboarding status
  app.get('/status', {
    preHandler: [authenticate],
    handler: async (request, reply) => {
      const status = await getOnboardingStatus(request.user!.id)
      return reply.status(200).send(status)
    },
  })

  // POST /api/onboarding/complete -- Submit onboarding form
  app.post('/complete', {
    preHandler: [authenticate, validateBody(completeOnboardingWithVenueSchema)],
    handler: async (request, reply) => {
      const data = request.body as z.infer<typeof completeOnboardingWithVenueSchema>
      const { ipAddress, userAgent } = extractAuditContext(request)

      const updatedUser = await completeOnboarding(
        request.user!.id,
        data,
        ipAddress,
        userAgent,
      )

      return reply.status(200).send(updatedUser)
    },
  })

  // GET /api/onboarding/positions -- List available positions
  app.get('/positions', {
    preHandler: [authenticate],
    handler: async (_request, reply) => {
      const result = await listPositions()
      return reply.status(200).send(result)
    },
  })

  // GET /api/onboarding/venues -- List available venues for selection
  app.get('/venues', {
    preHandler: [authenticate],
    handler: async (_request, reply) => {
      const result = await listVenuesForOnboarding()
      return reply.status(200).send(result)
    },
  })
}
