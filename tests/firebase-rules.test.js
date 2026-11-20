'use strict';

const { after, before, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require('@firebase/rules-unit-testing');
const { get, ref, set } = require('firebase/database');

const projectId = 'demo-dating-app';
const rules = fs.readFileSync(path.join(__dirname, '..', 'database.rules.json'), 'utf8');
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    database: {
      host: '127.0.0.1',
      port: 9000,
      rules
    }
  });
});

beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.database();
    await set(ref(db, 'chatParticipants/room-alice-bob/alice'), true);
    await set(ref(db, 'chats/room-alice-bob/messages/message-1'), {
      senderUid: 'alice',
      text: 'hello'
    });
    await set(ref(db, 'chatUserRooms/alice/room-alice-bob'), true);
    await set(ref(db, 'notifications/alice/notification-1'), { type: 'match' });
    await set(ref(db, 'notifications/bob/notification-1'), { type: 'message' });
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

test('denies unauthenticated chat reads', async () => {
  const db = testEnv.unauthenticatedContext().database();
  await assertFails(get(ref(db, 'chats/room-alice-bob')));
});

test('denies authenticated non-members access to a chat room', async () => {
  const db = testEnv.authenticatedContext('bob').database();
  await assertFails(get(ref(db, 'chats/room-alice-bob')));
});

test('allows a recorded room participant to read the chat', async () => {
  const db = testEnv.authenticatedContext('alice').database();
  await assertSucceeds(get(ref(db, 'chats/room-alice-bob')));
});

test('denies client writes to chat messages even for room participants', async () => {
  const db = testEnv.authenticatedContext('alice').database();
  await assertFails(set(ref(db, 'chats/room-alice-bob/messages/message-2'), {
    senderUid: 'alice',
    text: 'client write must be rejected'
  }));
});

test('denies clients access to server-managed chat participant records', async () => {
  const db = testEnv.authenticatedContext('alice').database();
  await assertFails(get(ref(db, 'chatParticipants/room-alice-bob')));
  await assertFails(set(ref(db, 'chatParticipants/room-alice-bob/alice'), false));
});

test('denies clients access to chat user-room indexes', async () => {
  const db = testEnv.authenticatedContext('alice').database();
  await assertFails(get(ref(db, 'chatUserRooms/alice')));
  await assertFails(set(ref(db, 'chatUserRooms/alice/room-other'), true));
});

test('allows users to read their own notifications', async () => {
  const db = testEnv.authenticatedContext('alice').database();
  await assertSucceeds(get(ref(db, 'notifications/alice')));
});

test('denies users access to another account notifications', async () => {
  const db = testEnv.authenticatedContext('alice').database();
  await assertFails(get(ref(db, 'notifications/bob')));
});

test('denies unauthenticated notification reads', async () => {
  const db = testEnv.unauthenticatedContext().database();
  await assertFails(get(ref(db, 'notifications/alice')));
});

test('denies client notification writes, including to the caller own path', async () => {
  const db = testEnv.authenticatedContext('alice').database();
  await assertFails(set(ref(db, 'notifications/alice/notification-2'), { type: 'system' }));
});

test('denies root-level reads and writes', async () => {
  const db = testEnv.authenticatedContext('alice').database();
  await assertFails(get(ref(db, '/')));
  await assertFails(set(ref(db, 'unprotected-probe'), true));
});
