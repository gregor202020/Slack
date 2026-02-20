import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db, sql } from '../client.js';
import {
  users,
  positions,
  venues,
  userVenues,
  channels,
  channelMembers,
  messages,
  dms,
  dmMembers,
  messageReactions,
  announcements,
  shifts,
  pinnedMessages,
  bookmarks,
} from '../schema/index.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Return a Date `minutesAgo` minutes before `base`. */
function ago(base: Date, minutesAgo: number): Date {
  return new Date(base.getTime() - minutesAgo * 60 * 1000);
}

/** Return a Date at a specific hour:minute on a given day offset from today. */
function dayAt(dayOffset: number, hour: number, minute = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d;
}

async function main() {
  console.log('Seeding database...\n');

  // ── 1. Positions ──────────────────────────────────────────────────────────

  console.log('Creating positions...');

  const positionNames = [
    'Pit Master',
    'Server',
    'Bartender',
    'Line Cook',
    'Manager',
    'Host',
  ];

  const insertedPositions = await db
    .insert(positions)
    .values(positionNames.map((name) => ({ name })))
    .onConflictDoNothing()
    .returning();

  // If positions already existed, fetch them all
  const allPositions = insertedPositions.length > 0
    ? insertedPositions
    : await db.query.positions.findMany();

  const positionMap = Object.fromEntries(
    allPositions.map((p) => [p.name, p.id])
  );

  console.log(`  ${allPositions.length} positions ready`);

  // ── 2. Users ──────────────────────────────────────────────────────────────

  console.log('Creating users...');

  const now = new Date();

  const userData = [
    {
      phone: '+15551000001',
      fullName: 'Jake Thompson',
      displayName: 'Big Jake',
      bio: 'Managing Third Wave since day one. Low and slow is the only way.',
      orgRole: 'super_admin',
      positionId: positionMap['Manager'],
      timezone: 'America/Chicago',
    },
    {
      phone: '+15551000002',
      fullName: 'Maria Garcia',
      displayName: 'Chef Maria',
      bio: 'Award-winning pit master. 15 years smoking meats.',
      orgRole: 'admin',
      positionId: positionMap['Pit Master'],
      timezone: 'America/Chicago',
    },
    {
      phone: '+15551000003',
      fullName: 'Chris Johnson',
      displayName: 'CJ',
      bio: 'Line cook by trade, grill master by passion. Keeper of the secret rub.',
      orgRole: 'basic',
      positionId: positionMap['Line Cook'],
      timezone: 'America/Chicago',
    },
    {
      phone: '+15551000004',
      fullName: 'Sam Williams',
      bio: 'Front of house pro. If the guests are happy, I am happy.',
      orgRole: 'basic',
      positionId: positionMap['Server'],
      timezone: 'America/Chicago',
    },
    {
      phone: '+15551000005',
      fullName: 'Alex Chen',
      displayName: 'Ace',
      bio: 'Craft cocktails and cold beer. Come sit at my bar.',
      orgRole: 'basic',
      positionId: positionMap['Bartender'],
      timezone: 'America/Chicago',
    },
  ];

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
    .returning();

  // If users already existed, fetch them by phone
  let allUsers = insertedUsers.length > 0
    ? insertedUsers
    : await db.query.users.findMany({
        where: (u, { inArray }) =>
          inArray(u.phone, userData.map((d) => d.phone)),
      });

  // Update existing users with displayName/bio if they were already seeded without them
  if (insertedUsers.length === 0) {
    for (const ud of userData) {
      if (ud.displayName || ud.bio) {
        await db
          .update(users)
          .set({
            ...(ud.displayName ? { displayName: ud.displayName } : {}),
            ...(ud.bio ? { bio: ud.bio } : {}),
          })
          .where(eq(users.phone, ud.phone));
      }
    }
    // Re-fetch after update
    allUsers = await db.query.users.findMany({
      where: (u, { inArray }) =>
        inArray(u.phone, userData.map((d) => d.phone)),
    });
  }

  const userByPhone = Object.fromEntries(
    allUsers.map((u) => [u.phone, u])
  );

  const jake = userByPhone['+15551000001']!;
  const maria = userByPhone['+15551000002']!;
  const chris = userByPhone['+15551000003']!;
  const sam = userByPhone['+15551000004']!;
  const alex = userByPhone['+15551000005']!;

  console.log(`  ${allUsers.length} users ready`);
  for (const u of allUsers) {
    console.log(`    - ${u.fullName} (${u.orgRole}) [${u.id}]`);
  }

  // ── 3. Venues ─────────────────────────────────────────────────────────────

  console.log('Creating venues...');

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
  ];

  const insertedVenues = await db
    .insert(venues)
    .values(venueData)
    .onConflictDoNothing()
    .returning();

  // Fetch all if they already existed
  const allVenues = insertedVenues.length > 0
    ? insertedVenues
    : await db.query.venues.findMany({
        where: (v, { inArray }) =>
          inArray(v.name, venueData.map((d) => d.name)),
      });

  const venueByName = Object.fromEntries(
    allVenues.map((v) => [v.name, v])
  );

  const downtown = venueByName['Third Wave Downtown']!;
  const lakeway = venueByName['Third Wave Lakeway']!;

  console.log(`  ${allVenues.length} venues ready`);
  for (const v of allVenues) {
    console.log(`    - ${v.name} [${v.id}]`);
  }

  // ── 4. User-Venue memberships ─────────────────────────────────────────────

  console.log('Assigning users to venues...');

  // All users belong to Downtown
  const downtownMembers = [jake, maria, chris, sam, alex];

  // Admin + 2 users belong to Lakeway
  const lakewayMembers = [maria, sam, alex];

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
  ];

  await db
    .insert(userVenues)
    .values(userVenueData)
    .onConflictDoNothing();

  console.log(`  ${downtownMembers.length} users -> Downtown`);
  console.log(`  ${lakewayMembers.length} users -> Lakeway`);

  // ── 5. Channels ───────────────────────────────────────────────────────────

  console.log('Creating channels...');

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
    .returning();

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
    .returning();

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
    .returning();

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
    .returning();

  // Resolve channel references (fetch if they already existed)
  const general = generalCh ?? await db.query.channels.findFirst({
    where: (c, { eq, and }) => and(eq(c.name, 'general'), eq(c.scope, 'org')),
  });
  const random = randomCh ?? await db.query.channels.findFirst({
    where: (c, { eq, and }) => and(eq(c.name, 'random'), eq(c.scope, 'org')),
  });
  const downtownChannel = downtownCh ?? await db.query.channels.findFirst({
    where: (c, { eq, and }) =>
      and(eq(c.name, 'downtown-team'), eq(c.venueId, downtown.id)),
  });
  const lakewayChannel = lakewayCh ?? await db.query.channels.findFirst({
    where: (c, { eq, and }) =>
      and(eq(c.name, 'lakeway-team'), eq(c.venueId, lakeway.id)),
  });

  if (!general || !random || !downtownChannel || !lakewayChannel) {
    throw new Error('Failed to create or find all channels');
  }

  console.log('  4 channels ready');
  console.log(`    - #general [${general.id}]`);
  console.log(`    - #random [${random.id}]`);
  console.log(`    - #downtown-team [${downtownChannel.id}]`);
  console.log(`    - #lakeway-team [${lakewayChannel.id}]`);

  // ── 6. Channel members ────────────────────────────────────────────────────

  console.log('Adding channel members...');

  const allUserIds = [jake, maria, chris, sam, alex].map((u) => u.id);

  // Everyone joins #general and #random
  const orgChannelMembers = [general.id, random.id].flatMap((channelId) =>
    allUserIds.map((userId) => ({ channelId, userId }))
  );

  // Downtown members join #downtown-team
  const downtownChannelMembers = downtownMembers.map((u) => ({
    channelId: downtownChannel.id,
    userId: u.id,
  }));

  // Lakeway members join #lakeway-team
  const lakewayChannelMembers = lakewayMembers.map((u) => ({
    channelId: lakewayChannel.id,
    userId: u.id,
  }));

  await db
    .insert(channelMembers)
    .values([
      ...orgChannelMembers,
      ...downtownChannelMembers,
      ...lakewayChannelMembers,
    ])
    .onConflictDoNothing();

  console.log(`  ${orgChannelMembers.length} org channel memberships`);
  console.log(`  ${downtownChannelMembers.length} downtown channel memberships`);
  console.log(`  ${lakewayChannelMembers.length} lakeway channel memberships`);

  // ── 7. Messages in #general ───────────────────────────────────────────────

  console.log('Creating messages in #general...');

  // Base time: ~48 hours ago, so messages span the last two days
  const baseTime = ago(now, 48 * 60);

  const generalMessages = [
    { userId: jake.id, body: 'Welcome to **The Smoker**! This is the org-wide general channel. All team members from both locations are here.', offsetMin: 0 },
    { userId: maria.id, body: 'Hey everyone! Excited to be here. The brisket is already on the smoker at Downtown.', offsetMin: 8 },
    { userId: chris.id, body: 'Anyone working the Downtown pit tonight? I need to swap my prep shift.', offsetMin: 22 },
    { userId: sam.id, body: 'I got the front of house covered at Downtown. Come hungry!', offsetMin: 35 },
    { userId: alex.id, body: 'New brisket rub recipe looking *fire* -- I added a touch of espresso powder', offsetMin: 47 },
    { userId: jake.id, body: '**Reminder:** Team meeting tomorrow at 9am. Both locations please join. We are covering the spring menu rollout.', offsetMin: 120 },
    { userId: maria.id, body: 'Lakeway is slammed today, great turnout for the lunch special. Brisket sold out by 1pm!', offsetMin: 195 },
    { userId: chris.id, body: 'Just pulled the pork shoulders off. 14 hour cook, looking **perfect**.', offsetMin: 260 },
    { userId: sam.id, body: 'A customer just left a 5-star review mentioning the mac and cheese. Who made it? @Alex', offsetMin: 310 },
    { userId: alex.id, body: 'That was me! New recipe with *smoked gouda* and a panko crust. Happy to share it.', offsetMin: 318 },
    { userId: jake.id, body: 'Great work everyone. Numbers are up 12% this month across both locations. Keep it going!', offsetMin: 480 },
    { userId: maria.id, body: '@Jake should we order extra pecan wood for next week? We are running low at Downtown.', offsetMin: 510 },
    { userId: jake.id, body: 'Yes, go ahead and place the order. Put it on the Downtown PO.', offsetMin: 515 },
    { userId: chris.id, body: 'Who is closing tonight? I can stay late if needed.', offsetMin: 600 },
    { userId: sam.id, body: 'I got close covered. Go home and rest, CJ. Early prep tomorrow!', offsetMin: 608 },
  ];

  const insertedGeneralMsgs = await db
    .insert(messages)
    .values(
      generalMessages.map((m) => ({
        channelId: general.id,
        userId: m.userId,
        body: m.body,
        createdAt: new Date(baseTime.getTime() + m.offsetMin * 60 * 1000),
      }))
    )
    .onConflictDoNothing()
    .returning();

  console.log(`  ${insertedGeneralMsgs.length} messages created in #general`);

  // ── 8. Thread replies in #general ─────────────────────────────────────────

  console.log('Creating threaded replies in #general...');

  // Threads on message index 2 (Chris asking about swapping shift)
  const threadParent1 = insertedGeneralMsgs[2]; // Chris: "Anyone working the Downtown pit tonight?"
  // Thread on message index 5 (Jake's meeting reminder)
  const threadParent2 = insertedGeneralMsgs[5]; // Jake: "Reminder: team meeting tomorrow..."

  let threadReplies: typeof insertedGeneralMsgs = [];
  if (threadParent1 && threadParent2) {
    const threadData = [
      // Thread 1: shift swap discussion
      { userId: sam.id, parentMessageId: threadParent1.id, body: 'I can cover you if you take my Saturday lunch shift?', offsetMin: 25 },
      { userId: chris.id, parentMessageId: threadParent1.id, body: 'Deal. Let me update the schedule.', offsetMin: 28 },
      { userId: jake.id, parentMessageId: threadParent1.id, body: 'Make sure you both log the swap in the system so payroll is right.', offsetMin: 40 },
      // Thread 2: meeting logistics
      { userId: maria.id, parentMessageId: threadParent2.id, body: 'Can we do it over video? Hard to leave the pit at 9am.', offsetMin: 125 },
      { userId: jake.id, parentMessageId: threadParent2.id, body: 'Yes, I will share a link in the morning. Lakeway crew can join remotely.', offsetMin: 128 },
      { userId: alex.id, parentMessageId: threadParent2.id, body: 'I will be there in person. Do we need to prep anything beforehand?', offsetMin: 135 },
      { userId: jake.id, parentMessageId: threadParent2.id, body: 'Just come with ideas for the spring cocktail menu, @Alex. Maria, bring the new smoked wings recipe notes.', offsetMin: 140 },
    ];

    threadReplies = await db
      .insert(messages)
      .values(
        threadData.map((m) => ({
          channelId: general.id,
          userId: m.userId,
          parentMessageId: m.parentMessageId,
          body: m.body,
          createdAt: new Date(baseTime.getTime() + m.offsetMin * 60 * 1000),
        }))
      )
      .onConflictDoNothing()
      .returning();

    console.log(`  ${threadReplies.length} thread replies in #general`);
  }

  // ── 9. Messages in #random ────────────────────────────────────────────────

  console.log('Creating messages in #random...');

  const randomBaseTime = ago(now, 36 * 60);

  const randomMessages = [
    { userId: alex.id, body: 'Anyone else watching the Longhorns game tonight? I have the bar TV reserved.', offsetMin: 0 },
    { userId: sam.id, body: 'Count me in! I will bring some of those smoked wings for the table.', offsetMin: 12 },
    { userId: chris.id, body: 'Just found the **best** hot sauce at the farmers market. It has ghost pepper and mango. Unreal.', offsetMin: 45 },
    { userId: maria.id, body: 'Chris, you and your hot sauce obsession... bring me a bottle though.', offsetMin: 52 },
    { userId: jake.id, body: 'PSA: whoever keeps leaving their apron in the walk-in, please stop. It is not a closet.', offsetMin: 120 },
    { userId: alex.id, body: '...that might be me. Sorry, boss.', offsetMin: 125 },
    { userId: sam.id, body: 'Has anyone tried the new taco truck on 6th street? Heard their al pastor is legit.', offsetMin: 240 },
    { userId: chris.id, body: 'Yeah it is *really* good. The salsa verde is next level.', offsetMin: 248 },
    { userId: maria.id, body: 'We should do a team dinner there one night after close. My treat for the Downtown crew.', offsetMin: 255 },
    { userId: jake.id, body: 'I am in. Let us plan for next Tuesday.', offsetMin: 260 },
  ];

  const insertedRandomMsgs = await db
    .insert(messages)
    .values(
      randomMessages.map((m) => ({
        channelId: random.id,
        userId: m.userId,
        body: m.body,
        createdAt: new Date(randomBaseTime.getTime() + m.offsetMin * 60 * 1000),
      }))
    )
    .onConflictDoNothing()
    .returning();

  console.log(`  ${insertedRandomMsgs.length} messages created in #random`);

  // ── 10. Messages in #downtown-team ────────────────────────────────────────

  console.log('Creating messages in #downtown-team...');

  const dtBaseTime = ago(now, 28 * 60);

  const downtownMessages = [
    { userId: jake.id, body: 'Good morning Downtown crew. Reminder: health inspector visit is **this Thursday**. Let us make sure everything is spotless.', offsetMin: 0 },
    { userId: maria.id, body: 'I did a walk-through yesterday. We need to re-label all the prep containers in the walk-in.', offsetMin: 15 },
    { userId: chris.id, body: 'On it. I will handle all the labeling during my morning prep shift.', offsetMin: 22 },
    { userId: sam.id, body: 'Front of house is clean. I deep-cleaned the bar area last night. Floors are spotless.', offsetMin: 45 },
    { userId: alex.id, body: 'Bar inventory is updated. We are low on bourbon though -- need to place an order today.', offsetMin: 55 },
    { userId: jake.id, body: 'Good updates all around. @Maria can you double check the smoker temp logs are printed out? They always ask for those.', offsetMin: 80 },
    { userId: maria.id, body: 'Already printed and in the binder. We are good to go.', offsetMin: 85 },
    { userId: chris.id, body: 'The slicer blade is getting dull. Can we get a replacement before Thursday?', offsetMin: 120 },
    { userId: jake.id, body: 'Ordered. Should arrive Wednesday morning.', offsetMin: 128 },
  ];

  const insertedDtMsgs = await db
    .insert(messages)
    .values(
      downtownMessages.map((m) => ({
        channelId: downtownChannel.id,
        userId: m.userId,
        body: m.body,
        createdAt: new Date(dtBaseTime.getTime() + m.offsetMin * 60 * 1000),
      }))
    )
    .onConflictDoNothing()
    .returning();

  console.log(`  ${insertedDtMsgs.length} messages created in #downtown-team`);

  // ── 11. Messages in #lakeway-team ─────────────────────────────────────────

  console.log('Creating messages in #lakeway-team...');

  const lwBaseTime = ago(now, 24 * 60);

  const lakewayMessages = [
    { userId: maria.id, body: 'Lakeway fam -- we hit a **new sales record** yesterday! $14,200 in a single day. Incredible work.', offsetMin: 0 },
    { userId: sam.id, body: 'That is amazing! The Saturday brunch crowd was nonstop.', offsetMin: 10 },
    { userId: alex.id, body: 'The new smoked old fashioned is a *huge* hit. Sold 47 of them yesterday alone.', offsetMin: 18 },
    { userId: maria.id, body: 'We need to talk about staffing. Weekends are brutal with just three of us. @Sam can you ask if anyone from Downtown wants extra shifts?', offsetMin: 60 },
    { userId: sam.id, body: 'Will do. I think Chris mentioned wanting more hours.', offsetMin: 68 },
    { userId: alex.id, body: 'Also heads up -- the keg cooler is making a weird noise again. I put in a maintenance request.', offsetMin: 120 },
    { userId: maria.id, body: 'Thanks Ace. I will follow up with the repair company on Monday.', offsetMin: 128 },
  ];

  const insertedLwMsgs = await db
    .insert(messages)
    .values(
      lakewayMessages.map((m) => ({
        channelId: lakewayChannel.id,
        userId: m.userId,
        body: m.body,
        createdAt: new Date(lwBaseTime.getTime() + m.offsetMin * 60 * 1000),
      }))
    )
    .onConflictDoNothing()
    .returning();

  console.log(`  ${insertedLwMsgs.length} messages created in #lakeway-team`);

  // ── 12. Direct Messages ───────────────────────────────────────────────────

  console.log('Creating DM conversations...');

  // DM 1: Jake <-> Maria (management chat)
  const [dm1] = await db
    .insert(dms)
    .values({ type: 'direct' })
    .onConflictDoNothing()
    .returning();

  // DM 2: Chris <-> Sam (shift coordination)
  const [dm2] = await db
    .insert(dms)
    .values({ type: 'direct' })
    .onConflictDoNothing()
    .returning();

  // DM 3: Jake <-> Alex (bar program discussion)
  const [dm3] = await db
    .insert(dms)
    .values({ type: 'direct' })
    .onConflictDoNothing()
    .returning();

  if (dm1 && dm2 && dm3) {
    // Add DM members
    await db
      .insert(dmMembers)
      .values([
        { dmId: dm1.id, userId: jake.id },
        { dmId: dm1.id, userId: maria.id },
        { dmId: dm2.id, userId: chris.id },
        { dmId: dm2.id, userId: sam.id },
        { dmId: dm3.id, userId: jake.id },
        { dmId: dm3.id, userId: alex.id },
      ])
      .onConflictDoNothing();

    // DM 1 messages: Jake <-> Maria
    const dm1Base = ago(now, 18 * 60);
    const dm1Messages = [
      { userId: jake.id, body: 'Hey Maria, how is the new smoker working out at Lakeway?', offsetMin: 0 },
      { userId: maria.id, body: 'It is a game changer. Temperature holds steady at 225 for hours without adjustment.', offsetMin: 8 },
      { userId: jake.id, body: 'Perfect. I am thinking about getting the same model for Downtown. What was the cost again?', offsetMin: 15 },
      { userId: maria.id, body: 'Around $4,800 after delivery. Totally worth it. The brisket bark is noticeably better.', offsetMin: 20 },
      { userId: jake.id, body: 'Let me run the numbers. If Q2 keeps trending up I will pull the trigger.', offsetMin: 28 },
      { userId: maria.id, body: 'Do it. The ROI is there. We are saving 2 hours of babysitting time per cook.', offsetMin: 35 },
    ];

    await db
      .insert(messages)
      .values(
        dm1Messages.map((m) => ({
          dmId: dm1.id,
          userId: m.userId,
          body: m.body,
          createdAt: new Date(dm1Base.getTime() + m.offsetMin * 60 * 1000),
        }))
      )
      .onConflictDoNothing();

    // DM 2 messages: Chris <-> Sam
    const dm2Base = ago(now, 10 * 60);
    const dm2Messages = [
      { userId: chris.id, body: 'Hey Sam, can you cover my opening prep shift this Saturday? I have a dentist appointment.', offsetMin: 0 },
      { userId: sam.id, body: 'What time does it start?', offsetMin: 5 },
      { userId: chris.id, body: '6am prep, service starts at 11. I will be there by noon.', offsetMin: 8 },
      { userId: sam.id, body: 'That is early but I can do it. You owe me one though!', offsetMin: 15 },
      { userId: chris.id, body: 'You are the best. I will take your Monday close in return.', offsetMin: 18 },
    ];

    await db
      .insert(messages)
      .values(
        dm2Messages.map((m) => ({
          dmId: dm2.id,
          userId: m.userId,
          body: m.body,
          createdAt: new Date(dm2Base.getTime() + m.offsetMin * 60 * 1000),
        }))
      )
      .onConflictDoNothing();

    // DM 3 messages: Jake <-> Alex
    const dm3Base = ago(now, 6 * 60);
    const dm3Messages = [
      { userId: jake.id, body: 'Alex, the smoked old fashioned numbers are incredible. 47 in one day at Lakeway!', offsetMin: 0 },
      { userId: alex.id, body: 'Thanks boss! I have been experimenting with pecan smoke instead of mesquite. Much smoother.', offsetMin: 12 },
      { userId: jake.id, body: 'I want to make it a signature cocktail across both locations. Can you write up the recipe and train the Downtown bar?', offsetMin: 18 },
      { userId: alex.id, body: 'Absolutely. I will have a recipe card and training plan ready by Friday.', offsetMin: 22 },
    ];

    await db
      .insert(messages)
      .values(
        dm3Messages.map((m) => ({
          dmId: dm3.id,
          userId: m.userId,
          body: m.body,
          createdAt: new Date(dm3Base.getTime() + m.offsetMin * 60 * 1000),
        }))
      )
      .onConflictDoNothing();

    console.log('  3 DM conversations created (15 messages total)');
  }

  // ── 13. Reactions ─────────────────────────────────────────────────────────

  console.log('Adding reactions...');

  const reactionData: { messageId: string; userId: string; emoji: string }[] = [];

  // Reactions on #general messages
  if (insertedGeneralMsgs.length > 0) {
    // Welcome message gets fire and celebration
    if (insertedGeneralMsgs[0]) {
      reactionData.push(
        { messageId: insertedGeneralMsgs[0].id, userId: maria.id, emoji: '🔥' },
        { messageId: insertedGeneralMsgs[0].id, userId: chris.id, emoji: '🎉' },
        { messageId: insertedGeneralMsgs[0].id, userId: sam.id, emoji: '👍' },
        { messageId: insertedGeneralMsgs[0].id, userId: alex.id, emoji: '🎉' },
      );
    }
    // Alex's rub recipe gets fire
    if (insertedGeneralMsgs[4]) {
      reactionData.push(
        { messageId: insertedGeneralMsgs[4].id, userId: jake.id, emoji: '🔥' },
        { messageId: insertedGeneralMsgs[4].id, userId: maria.id, emoji: '🔥' },
        { messageId: insertedGeneralMsgs[4].id, userId: chris.id, emoji: '💯' },
      );
    }
    // Chris's 14-hour cook gets love
    if (insertedGeneralMsgs[7]) {
      reactionData.push(
        { messageId: insertedGeneralMsgs[7].id, userId: jake.id, emoji: '❤️' },
        { messageId: insertedGeneralMsgs[7].id, userId: maria.id, emoji: '🔥' },
        { messageId: insertedGeneralMsgs[7].id, userId: alex.id, emoji: '💯' },
      );
    }
    // Alex's mac and cheese answer gets thumbs up
    if (insertedGeneralMsgs[9]) {
      reactionData.push(
        { messageId: insertedGeneralMsgs[9].id, userId: sam.id, emoji: '👍' },
        { messageId: insertedGeneralMsgs[9].id, userId: jake.id, emoji: '🔥' },
        { messageId: insertedGeneralMsgs[9].id, userId: maria.id, emoji: '❤️' },
      );
    }
    // Jake's numbers update gets celebration
    if (insertedGeneralMsgs[10]) {
      reactionData.push(
        { messageId: insertedGeneralMsgs[10].id, userId: maria.id, emoji: '🎉' },
        { messageId: insertedGeneralMsgs[10].id, userId: chris.id, emoji: '🎉' },
        { messageId: insertedGeneralMsgs[10].id, userId: sam.id, emoji: '💯' },
        { messageId: insertedGeneralMsgs[10].id, userId: alex.id, emoji: '🔥' },
      );
    }
  }

  // Reactions on #random messages
  if (insertedRandomMsgs.length > 0) {
    // Longhorns game
    if (insertedRandomMsgs[0]) {
      reactionData.push(
        { messageId: insertedRandomMsgs[0].id, userId: sam.id, emoji: '🎉' },
        { messageId: insertedRandomMsgs[0].id, userId: chris.id, emoji: '👍' },
      );
    }
    // Hot sauce find
    if (insertedRandomMsgs[2]) {
      reactionData.push(
        { messageId: insertedRandomMsgs[2].id, userId: alex.id, emoji: '🔥' },
        { messageId: insertedRandomMsgs[2].id, userId: jake.id, emoji: '😂' },
      );
    }
    // Maria's team dinner offer
    if (insertedRandomMsgs[8]) {
      reactionData.push(
        { messageId: insertedRandomMsgs[8].id, userId: sam.id, emoji: '❤️' },
        { messageId: insertedRandomMsgs[8].id, userId: alex.id, emoji: '🎉' },
        { messageId: insertedRandomMsgs[8].id, userId: chris.id, emoji: '💯' },
      );
    }
  }

  // Reactions on #lakeway-team messages
  if (insertedLwMsgs.length > 0) {
    // Sales record announcement
    if (insertedLwMsgs[0]) {
      reactionData.push(
        { messageId: insertedLwMsgs[0].id, userId: sam.id, emoji: '🔥' },
        { messageId: insertedLwMsgs[0].id, userId: alex.id, emoji: '🎉' },
      );
    }
    // Smoked old fashioned success
    if (insertedLwMsgs[2]) {
      reactionData.push(
        { messageId: insertedLwMsgs[2].id, userId: maria.id, emoji: '💯' },
        { messageId: insertedLwMsgs[2].id, userId: sam.id, emoji: '🔥' },
      );
    }
  }

  if (reactionData.length > 0) {
    await db
      .insert(messageReactions)
      .values(reactionData)
      .onConflictDoNothing();

    console.log(`  ${reactionData.length} reactions added`);
  }

  // ── 14. Announcements ─────────────────────────────────────────────────────

  console.log('Creating announcements...');

  const announcementData = [
    {
      userId: jake.id,
      scope: 'org',
      title: 'Spring Menu Rollout -- Action Required',
      body: 'Team, we are rolling out the new **spring menu** starting next Monday across both locations. All staff must review the updated menu items and pricing before your next shift. Training packets are in the break room. Please acknowledge this announcement once you have reviewed the materials.',
      ackRequired: true,
      locked: false,
      createdAt: ago(now, 24 * 60),
    },
    {
      userId: maria.id,
      scope: 'venue',
      venueId: downtown.id,
      title: 'Health Inspector Visit -- Thursday',
      body: 'Downtown crew: the health inspector is coming **this Thursday** between 10am-2pm. Please make sure your stations are spotless and all prep containers are properly labeled with dates. Temp logs must be printed and in the front binder. Let me know if you need anything.',
      ackRequired: false,
      locked: false,
      createdAt: ago(now, 20 * 60),
    },
  ];

  const insertedAnnouncements = await db
    .insert(announcements)
    .values(announcementData)
    .onConflictDoNothing()
    .returning();

  console.log(`  ${insertedAnnouncements.length} announcements created`);

  // ── 15. Shifts (next 7 days) ──────────────────────────────────────────────

  console.log('Creating shifts for next 7 days...');

  const shiftData: {
    venueId: string;
    userId: string;
    startTime: Date;
    endTime: Date;
    roleLabel: string;
    notes: string | null;
  }[] = [];

  // Shift templates: realistic BBQ restaurant patterns
  // Morning prep:  6:00 - 11:00
  // Lunch service: 10:30 - 16:00
  // Dinner service: 15:30 - 22:00
  // Close:         20:00 - 00:30 (next day)

  for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
    // ── Downtown shifts ──
    // Jake: manager shifts (lunch through dinner, not every day)
    if (dayOffset % 2 === 0) {
      shiftData.push({
        venueId: downtown.id,
        userId: jake.id,
        startTime: dayAt(dayOffset, 10, 0),
        endTime: dayAt(dayOffset, 18, 0),
        roleLabel: 'Manager on Duty',
        notes: dayOffset === 0 ? 'Spring menu training prep' : null,
      });
    }

    // Maria: pit master morning/lunch at Downtown (alternates with Lakeway)
    if (dayOffset % 2 === 0) {
      shiftData.push({
        venueId: downtown.id,
        userId: maria.id,
        startTime: dayAt(dayOffset, 6, 0),
        endTime: dayAt(dayOffset, 14, 0),
        roleLabel: 'Pit Master',
        notes: dayOffset === 0 ? 'Start brisket at 6am for lunch service' : null,
      });
    }

    // Chris: line cook morning prep + lunch
    shiftData.push({
      venueId: downtown.id,
      userId: chris.id,
      startTime: dayAt(dayOffset, 6, 0),
      endTime: dayAt(dayOffset, 14, 0),
      roleLabel: 'Morning Prep / Line',
      notes: null,
    });

    // Sam: server lunch or dinner (alternating)
    shiftData.push({
      venueId: downtown.id,
      userId: sam.id,
      startTime: dayOffset % 2 === 0 ? dayAt(dayOffset, 10, 30) : dayAt(dayOffset, 15, 30),
      endTime: dayOffset % 2 === 0 ? dayAt(dayOffset, 16, 0) : dayAt(dayOffset, 22, 0),
      roleLabel: dayOffset % 2 === 0 ? 'Lunch Server' : 'Dinner Server',
      notes: null,
    });

    // Alex: bartender dinner shifts at Downtown
    if (dayOffset < 5) {
      // weekdays at Downtown
      shiftData.push({
        venueId: downtown.id,
        userId: alex.id,
        startTime: dayAt(dayOffset, 15, 30),
        endTime: dayAt(dayOffset, 23, 0),
        roleLabel: 'Bartender',
        notes: dayOffset === 4 ? 'Friday happy hour -- extra prep needed' : null,
      });
    }

    // ── Lakeway shifts ──
    // Maria: pit master at Lakeway on odd days
    if (dayOffset % 2 === 1) {
      shiftData.push({
        venueId: lakeway.id,
        userId: maria.id,
        startTime: dayAt(dayOffset, 6, 0),
        endTime: dayAt(dayOffset, 14, 0),
        roleLabel: 'Pit Master',
        notes: null,
      });
    }

    // Sam: covers Lakeway lunch on even days
    if (dayOffset % 2 === 0 && dayOffset > 0) {
      shiftData.push({
        venueId: lakeway.id,
        userId: sam.id,
        startTime: dayAt(dayOffset, 10, 30),
        endTime: dayAt(dayOffset, 16, 0),
        roleLabel: 'Lunch Server',
        notes: null,
      });
    }

    // Alex: bartender at Lakeway on weekends
    if (dayOffset >= 5) {
      shiftData.push({
        venueId: lakeway.id,
        userId: alex.id,
        startTime: dayAt(dayOffset, 14, 0),
        endTime: dayAt(dayOffset, 23, 30),
        roleLabel: 'Bartender',
        notes: 'Weekend rush -- stock extra smoked old fashioned mix',
      });
    }
  }

  const insertedShifts = await db
    .insert(shifts)
    .values(shiftData)
    .onConflictDoNothing()
    .returning();

  console.log(`  ${insertedShifts.length} shifts created across 7 days`);

  // ── 16. Pinned Messages ───────────────────────────────────────────────────

  console.log('Pinning important messages...');

  const pinData: { channelId: string; messageId: string; pinnedBy: string }[] = [];

  // Pin the welcome message in #general
  if (insertedGeneralMsgs[0]) {
    pinData.push({
      channelId: general.id,
      messageId: insertedGeneralMsgs[0].id,
      pinnedBy: jake.id,
    });
  }

  // Pin the meeting reminder in #general
  if (insertedGeneralMsgs[5]) {
    pinData.push({
      channelId: general.id,
      messageId: insertedGeneralMsgs[5].id,
      pinnedBy: jake.id,
    });
  }

  // Pin the health inspector notice in #downtown-team
  if (insertedDtMsgs[0]) {
    pinData.push({
      channelId: downtownChannel.id,
      messageId: insertedDtMsgs[0].id,
      pinnedBy: jake.id,
    });
  }

  if (pinData.length > 0) {
    await db
      .insert(pinnedMessages)
      .values(pinData)
      .onConflictDoNothing();

    console.log(`  ${pinData.length} messages pinned`);
  }

  // ── 17. Bookmarks ────────────────────────────────────────────────────────

  console.log('Creating bookmarks...');

  const bookmarkData: { userId: string; messageId: string; note: string | null }[] = [];

  // Jake bookmarks the numbers update
  if (insertedGeneralMsgs[10]) {
    bookmarkData.push({
      userId: jake.id,
      messageId: insertedGeneralMsgs[10].id,
      note: 'Q1 growth numbers -- reference for board meeting',
    });
  }

  // Jake bookmarks Maria's smoker cost info from DM (we need a DM message ID)
  // Instead, bookmark Alex's mac and cheese recipe mention
  if (insertedGeneralMsgs[9]) {
    bookmarkData.push({
      userId: jake.id,
      messageId: insertedGeneralMsgs[9].id,
      note: 'New mac recipe -- add to menu doc',
    });
  }

  // Maria bookmarks the sales record at Lakeway
  if (insertedLwMsgs[0]) {
    bookmarkData.push({
      userId: maria.id,
      messageId: insertedLwMsgs[0].id,
      note: 'Record day -- share with Jake at next review',
    });
  }

  if (bookmarkData.length > 0) {
    await db
      .insert(bookmarks)
      .values(bookmarkData)
      .onConflictDoNothing();

    console.log(`  ${bookmarkData.length} bookmarks created`);
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  const totalMessages = insertedGeneralMsgs.length
    + threadReplies.length
    + insertedRandomMsgs.length
    + insertedDtMsgs.length
    + insertedLwMsgs.length
    + 15; // DM messages

  console.log('\n========================================');
  console.log('Seed complete!');
  console.log('========================================');
  console.log(`  Users:          ${allUsers.length}`);
  console.log(`  Venues:         ${allVenues.length}`);
  console.log(`  Channels:       4`);
  console.log(`  Channel msgs:   ${insertedGeneralMsgs.length + threadReplies.length + insertedRandomMsgs.length + insertedDtMsgs.length + insertedLwMsgs.length}`);
  console.log(`  Thread replies: ${threadReplies.length}`);
  console.log(`  DM convos:      3`);
  console.log(`  DM messages:    15`);
  console.log(`  Total messages: ~${totalMessages}`);
  console.log(`  Reactions:      ${reactionData.length}`);
  console.log(`  Announcements:  ${insertedAnnouncements.length}`);
  console.log(`  Shifts:         ${insertedShifts.length}`);
  console.log(`  Pinned msgs:    ${pinData.length}`);
  console.log(`  Bookmarks:      ${bookmarkData.length}`);
  console.log('========================================\n');
}

main()
  .then(() => {
    console.log('Seed script finished successfully');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seed script failed:', err);
    process.exit(1);
  });
