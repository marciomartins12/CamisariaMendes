const express = require('express');
const HomeController = require('../controllers/HomeController');
const adminRoutes = require('./admin');

const router = express.Router();

router.get('/', HomeController.index);
router.post('/campanha/entrar', HomeController.accessCampaign);
router.get('/c/:code', HomeController.viewCampaign);
router.use('/admin', adminRoutes);

module.exports = router;
