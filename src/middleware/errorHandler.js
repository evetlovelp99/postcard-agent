function errorHandler(error, _req, res, _next) {
  console.error(error);

  return res.status(500).json({
    success: false,
    error: error.message || 'Internal server error.',
  });
}

module.exports = {
  errorHandler,
};
