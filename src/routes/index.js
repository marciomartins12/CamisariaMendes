const express = require('express');
const HomeController = require('../controllers/HomeController');
const AuthController = require('../controllers/AuthController');
const adminRoutes = require('./admin');

const router = express.Router();

// Home & Public
router.get('/', HomeController.index);
router.post('/campanha/entrar', HomeController.accessCampaign);

// User Auth
router.get('/auth/login', AuthController.loginPage);
router.post('/auth/login', AuthController.login);
router.post('/auth/register', AuthController.register);
router.get('/auth/logout', AuthController.logout);

// Campaign Store (Protected)
router.get('/c/:code', HomeController.viewCampaign);

router.use('/admin', adminRoutes);

module.exports = router;
