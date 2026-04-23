const express = require('express');
const router = express.Router();
const sequelize = require('../database'); // Import your Sequelize instance

router.get('/', async (req, res) => {
  try {
    // .authenticate() sends a simple 'SELECT 1+1 AS result' query to the DB
    await sequelize.authenticate();

    res.status(200).json({
      status: 'OK',
      database: 'PostgreSQL Connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'Service Unavailable',
      database: 'Disconnected',
      error: error.message
    });
  }
});

module.exports = router;