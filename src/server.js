const app = require('./app');
const { closeMongoConnection } = require('./config/database');

const port = Number.parseInt(process.env.PORT, 10) || 3000;

const server = app.listen(port, () => {
  console.log(`PostCard Agent API listening on http://localhost:${port}`);
});

async function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    try {
      await closeMongoConnection();
      console.log('MongoDB connection closed.');
      process.exit(0);
    } catch (error) {
      console.error('Failed to close MongoDB connection cleanly:', error);
      process.exit(1);
    }
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
