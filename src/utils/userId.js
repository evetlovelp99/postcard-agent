function getUserId(req) {
  const headerId = req.headers['x-user-id'];

  return (
    (typeof headerId === 'string' ? headerId.trim() : '') ||
    req.body?.userId?.trim() ||
    req.body?.travelerId?.trim() ||
    req.query?.userId?.trim() ||
    req.query?.travelerId?.trim() ||
    'demo-user'
  );
}

function buildUserIdQuery(userId) {
  return {
    $or: [{ userId }, { travelerId: userId }],
  };
}

module.exports = {
  buildUserIdQuery,
  getUserId,
};
