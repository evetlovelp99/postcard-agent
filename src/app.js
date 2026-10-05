require('dotenv').config();

const cors = require('cors');
const express = require('express');

const { errorHandler } = require('./middleware/errorHandler');
const postcardRoutes = require('./routes/postcardRoutes');

const app = express();

app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json({ limit: '15mb' }));

app.use('/api', postcardRoutes);

app.use((_req, res) => {
  return res.status(404).json({
    success: false,
    error: 'Route not found.',
  });
});

app.use(errorHandler);

module.exports = app;
