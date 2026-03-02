const express = require('express');
const router = express.Router();
const statusController = require('../controllers/statusController');

// Health check básico
router.get('/health', statusController.getHealth);

// Status do serviço
router.get('/status', statusController.getStatus);

module.exports = router;

