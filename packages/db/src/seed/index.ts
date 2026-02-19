import 'dotenv/config'
import { db, sql } from '../client.js'
import {
  users,
  positions,
  venues,
  userVenues,
  channels,
  channelMembers,
  messages,
} from '../schema/index.js'

async function main() {
  console.log('Seeding database...\n')

  // ── 1. Positions ──────────────────────────────────────────────────────────

  console.log('Creating positions...')

  const positionNames = [
    'Pit Master',
    'Server',
    'Bartender',
    'Line Cook',
    'Manager',
    'Host',
  ]

  const insertedPositions = await db
    .insert(positions)
    .values(positionNames.map((name) => ({ name })))
    .onConflictDoNothing()
    .returning()

  // If positions already existed, fetch them all
  const allPositions = insertedPositions.length > 0
    ? insertedPositions
    : await db.query.positions.findMany()

  const positionMap = Object.fromEntries(
    allPositions.map((p) => [p.name, p.id])
  )

  console.log(`  ${allPositions.length} positions ready`)

  // ── 2. Users ──────────────────────────────────────────────────────────────

  console.log('Creating users...')

  const now = new Date()

  const userData = [
    {
      phone: '+15551000001',
      fullName: 'Jake Thompson',
      orgRole: 'super_admin',
      positionId: positionMap['Manager'],
      timezone: 'America/Chicago',
    },
    {
      phone: '+15551000002',
      fullName: 'Maria Garcia',
      orgRole: 'admin',
      positionId: positionMap['Pit Master'],
      timezone: 'America/Chicago',
    },
    {
      phone: '+15551000003',
      fullName: 'Chris Johnson',
      orgRole: 'basic',
      positionId: positionMap['Line Cook'],
      timezone: 'America/Chicago',
    },
    {
      phone: '+15551000004',
      fullName: 'Sam Williams',
      orgRole: 'basic',
      positionId: positionMap['Server'],
      timezone: 'America/Chicago',
    },
    {
      phone: '+15551000005',
      fullName: 'Alex Chen',
      orgRole: 'basic',
      positionId: positionMap['Bartender'],
      timezone: 'America/Chicago',
    },
  ]

  const insertedUsers = await db
    .insert(users)
    .values(
      userData.map((u) => ({
        ...u,
        status: 'active',
        signupAt: now,
        profileCompletedAt: now,
      }))
    )
    .onConflictDoNothing()
    .returning()

  // If users already existed, fetch them by phone
  const allUsers = insertedUsers.length > 0
    ? insertedUsers
    : await db.query.users.findMany({
        where: (u, { inArray }) =>
          inArray(u.phone, userData.map((d) => d.phone)),
      })

  const userByPhone = Object.fromEntries(
    allUsers.map((u) => [u.phone, u])
  )

  const jake = userByPhone['+15551000001']!
  const maria = userByPhone['+15551000002']!
  const chris = userByPhone['+15551000003']!
  const sam = userByPhone['+15551000004']!
  const alex = userByPhone['+15551000005']!

  console.log(`  ${allUsers.length} users ready`)
  for (const u of allUsers) {
    console.log(`    - ${u.fullName} (${u.orgRole}) [${u.id}]`)
  }

  // ── 3. Venues ─────────────────────────────────────────────────────────────

  console.log('Creating venues...')

  const venueData = [
    {
      name: 'Third Wave Downtown',
      address: '123 Main St, Austin, TX 78701',
      status: 'active' as const,
      createdBy: jake.id,
    },
    {
      name: 'Third Wave Lakeway',
      address: '456 Bee Cave Rd, Lakeway, TX 78734',
      status: 'active' as const,
      createdBy: jake.id,
    },
  ]

  const insertedVenues = await db
    .insert(venues)
    .values(venueData)
    .onConflictDoNothing()
    .returning()

  // Fetch all if they already existed
  const allVenues = insertedVenues.length > 0
    ? insertedVenues
    : await db.query.venues.findMany({
        where: (v, { inArray }) =>
          inArray(v.name, venueData.map((d) => d.name)),
      })

  const venueByName = Object.fromEntries(
    allVenues.map((v) => [v.name, v])
  )

  const downtown = venueByName['Third Wave Downtown']!
  const lakeway = venueByName['Third Wave Lakeway']!

  console.log(`  ${allVenues.length} venues ready`)
  for (const v of allVenues) {
    console.log(`    - ${v.name} [${v.id}]`)
  }

  // ── 4. User-Venue memberships ─────────────────────────────────────────────

  console.log('Assigning users to venues...')

  // All users belong to Downtown
  const downtownMembers = [jake, maria, chris, sam, alex]

  // Admin + 2 users belong to Lakeway
  const lakewayMembers = [maria, sam, alex]

  const userVenueData = [
    ...downtownMembers.map((u) => ({
      userId: u.id,
      venueId: downtown.id,
      venueRole: u.orgRole === 'super_admin' || u.orgRole === 'admin'
        ? 'admin'
        : 'basic',
    })),
    ...lakewayMembers.map((u) => ({
      userId: u.id,
      venueId: lakeway.id,
      venueRole: u.orgRole === 'admin' ? 'admin' : 'basic',
    })),
  ]

  await db
    .insert(userVenues)
    .values(userVenueData)
    .onConflictDoNothing()

  console.log(`  ${downtownMembers.length} users -> Downtown`)
  console.log(`  ${lakewayMembers.length} users -> Lakeway`)

  // ── 5. Channels ───────────────────────────────────────────────────────────

  console.log('Creating channels...')

  // Org-scope channels
  const [generalCh] = await db
    .insert(channels)
    .values({
      name: 'general',
      description: 'Company-wide announcements and conversation',
      type: 'public',
      scope: 'org',
      isDefault: true,
      isMandatory: true,
      status: 'active',
      ownerUserId: jake.id,
    })
    .onConflictDoNothing()
    .returning()

  const [randomCh] = await db
    .insert(channels)
    .values({
      name: 'random',
      description: 'Off-topic banter, memes, and good vibes',
      type: 'public',
      scope: 'org',
      isDefault: true,
      isMandatory: false,
      status: 'active',
      ownerUserId: jake.id,
    })
    .onConflictDoNothing()
    .returning()

  // Venue-scope channels
  const [downtownCh] = await db
    .insert(channels)
    .values({
      name: 'downtown-team',
      description: 'Downtown location team chat',
      type: 'public',
      scope: 'venue',
      venueId: downtown.id,
      isDefault: true,
      isMandatory: true,
      status: 'active',
      ownerUserId: jake.id,
    })
    .onConflictDoNothing()
    .returning()

  const [lakewayCh] = await db
    .insert(channels)
    .values({
      name: 'lakeway-team',
      description: 'Lakeway location team chat',
      type: 'public',
      scope: 'venue',
      venueId: lakeway.id,
      isDefault: true,
      isMandatory: true,
      status: 'active',
      ownerUserId: maria.id,
    })
    .onConflictDoNothing()
    .returning()

  // Resolve channel references (fetch if they already existed)
  const general = generalCh ?? await db.query.channels.findFirst({
    where: (c, { eq, and }) => and(eq(c.name, 'general'), eq(c.scope, 'org')),
  })
  const random = randomCh ?? await db.query.channels.findFirst({
    where: (c, { eq, and }) => and(eq(c.name, 'random'), eq(c.scope, 'org')),
  })
  const downtownChannel = downtownCh ?? await db.query.channels.findFirst({
    where: (c, { eq, and }) =>
      and(eq(c.name, 'downtown-team'), eq(c.venueId, downtown.id)),
  })
  const lakewayChannel = lakewayCh ?? await db.query.channels.findFirst({
    where: (c, { eq, and }) =>
      and(eq(c.name, 'lakeway-team'), eq(c.venueId, lakeway.id)),
  })

  if (!general || !random || !downtownChannel || !lakewayChannel) {
    throw new Error('Failed to create or find all channels')
  }

  console.log('  4 channels ready')
  console.log(`    - #general [${general.id}]`)
  console.log(`    - #random [${random.id}]`)
  console.log(`    - #downtown-team [${downtownChannel.id}]`)
  console.log(`    - #lakeway-team [${lakewayChannel.id}]`)

  // ── 6. Channel members ────────────────────────────────────────────────────

  console.log('Adding channel members...')

  const allUserIds = [jake, maria, chris, sam, alex].map((u) => u.id)

  // Everyone joins #general and #random
  const orgChannelMembers = [general.id, random.id].flatMap((channelId) =>
    allUserIds.map((userId) => ({ channelId, userId }))
  )

  // Downtown members join #downtown-team
  const downtownChannelMembers = downtownMembers.map((u) => ({
    channelId: downtownChannel.id,
    userId: u.id,
  }))

  // Lakeway members join #lakeway-team
  const lakewayChannelMembers = lakewayMembers.map((u) => ({
    channelId: lakewayChannel.id,
    userId: u.id,
  }))

  await db
    .insert(channelMembers)
    .values([
      ...orgChannelMembers,
      ...downtownChannelMembers,
      ...lakewayChannelMembers,
    ])
    .onConflictDoNothing()

  console.log(`  ${orgChannelMembers.length} org channel memberships`)
  console.log(`  ${downtownChannelMembers.length} downtown channel memberships`)
  console.log(`  ${lakewayChannelMembers.length} lakeway channel memberships`)

  // ── 7. Messages in #general ───────────────────────────────────────────────

  console.log('Creating sample messages in #general...')

  const messageData = [
    { userId: jake.id, body: 'Welcome to The Smoker! This is the org-wide general channel.' },
    { userId: maria.id, body: 'Hey everyone! Excited to be here. The brisket is already on the smoker.' },
    { userId: chris.id, body: 'Anyone working the Downtown pit tonight?' },
    { userId: sam.id, body: 'I got the front of house covered at Downtown. Come hungry!' },
    { userId: alex.id, body: 'New brisket rub recipe looking fire' },
    { userId: jake.id, body: 'Reminder: team meeting tomorrow at 9am. Both locations please join.' },
    { userId: maria.id, body: 'Lakeway is slammed today, great turnout for the lunch special.' },
    { userId: chris.id, body: 'Just pulled the pork shoulders off. 14 hour cook, looking perfect.' },
    { userId: sam.id, body: 'A customer just left a 5-star review mentioning the mac and cheese. Who made it?' },
    { userId: alex.id, body: 'That was me! New recipe with smoked gouda and a panko crust.' },
  ]

  // Stagger timestamps so messages have a realistic order
  const baseTime = new Date()
  baseTime.setHours(baseTime.getHours() - 2)

  await db
    .insert(messages)
    .values(
      messageData.map((m, i) => ({
        channelId: general.id,
        userId: m.userId,
        body: m.body,
        createdAt: new Date(baseTime.getTime() + i * 5 * 60 * 1000), // 5 min apart
      }))
    )
    .onConflictDoNothing()

  console.log(`  ${messageData.length} messages created in #general`)

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log('\nSeed complete!')
}

main()
  .then(() => {
    console.log('Seed script finished successfully')
    process.exit(0)
  })
  .catch((err) => {
    console.error('Seed script failed:', err)
    process.exit(1)
  })
