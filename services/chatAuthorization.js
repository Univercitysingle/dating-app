const ChatMessage = require('../models/ChatMessage');
const Match = require('../models/Match');

async function authorizeRoom(userUid, roomId, peerUid) {
  if (typeof userUid !== 'string' || !userUid || typeof roomId !== 'string' || !roomId || roomId.length > 256) return false;
  if (peerUid !== undefined && (typeof peerUid !== 'string' || !peerUid || peerUid === userUid)) return false;

  const parts = roomId.split('-');
  if (!peerUid) {
    if (!parts.includes(userUid)) {
      const ownMessage = await ChatMessage.findOne({
        roomId,
        $or: [{ senderUid: userUid }, { receiverUid: userUid }],
      }).select('_id').lean();
      if (!ownMessage) return false;
    }
    const otherUid = parts.find(uid => uid && uid !== userUid);
    if (otherUid) {
      const matched = await Match.findOne({
        status: 'matched',
        $or: [
          { user1Uid: userUid, user2Uid: otherUid },
          { user1Uid: otherUid, user2Uid: userUid },
        ],
      }).select('_id').lean();
      if (matched) return true;
    }
    return Boolean(await ChatMessage.findOne({
      roomId,
      $or: [
        { senderUid: userUid },
        { receiverUid: userUid },
      ],
    }).select('_id').lean());
  }

  const roomIds = [[userUid, peerUid].join('-'), [peerUid, userUid].join('-')];
  if (!roomIds.includes(roomId)) return false;

  const matched = await Match.findOne({
    status: 'matched',
    $or: [
      { user1Uid: userUid, user2Uid: peerUid },
      { user1Uid: peerUid, user2Uid: userUid },
    ],
  }).select('_id').lean();
  return Boolean(matched);
}

module.exports = { authorizeRoom };
