const ChatMessage = require('../models/ChatMessage');
const Match = require('../models/Match');

async function authorizeRoom(userUid, roomId, peerUid) {
  if (typeof userUid !== 'string' || !userUid || typeof roomId !== 'string' || !roomId || roomId.length > 256) return false;
  if (peerUid !== undefined && (typeof peerUid !== 'string' || !peerUid || peerUid === userUid)) return false;

  const existingQuery = { roomId, $or: [{ senderUid: userUid }, { receiverUid: userUid }] };
  if (peerUid) {
    existingQuery.$or = [
      { senderUid: userUid, receiverUid: peerUid },
      { senderUid: peerUid, receiverUid: userUid },
    ];
  }
  const existingMessage = await ChatMessage.findOne(existingQuery).select('_id').lean();
  if (existingMessage) return true;
  if (!peerUid) return false;

  const roomIds = [[userUid, peerUid].join('-'), [peerUid, userUid].join('-')];
  if (!roomIds.includes(roomId)) return false;

  const match = await Match.findOne({
    status: 'matched',
    $or: [
      { user1Uid: userUid, user2Uid: peerUid },
      { user1Uid: peerUid, user2Uid: userUid },
    ],
  }).select('_id').lean();
  return Boolean(match);
}

module.exports = { authorizeRoom };
