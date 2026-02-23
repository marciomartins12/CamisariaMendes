const express = require('express');
const HomeController = require('../controllers/HomeController');
const AuthController = require('../controllers/AuthController');
const CouponController = require('../controllers/CouponController');
const PaymentController = require('../controllers/PaymentController');
const OrderController = require('../controllers/OrderController');
const adminRoutes = require('./admin');

const router = express.Router();

// API Routes
router.post('/api/validate-coupon', CouponController.validate);
router.post('/api/register-coupon-usage', CouponController.registerUsage);
router.post('/api/create-payment', PaymentController.createPreference);
router.post('/api/process-payment', PaymentController.processPaymentBrick);
router.post('/api/webhook', PaymentController.webhook);
router.get('/api/check-payment/:orderId', PaymentController.checkStatus); // New manual check route
router.post('/api/continue-payment/:orderId', PaymentController.continuePayment); // Repay route

// Checkout & Orders
router.get('/checkout', OrderController.checkoutPage);
router.get('/checkout/pagamento/:orderId', OrderController.paymentPage);
router.get('/checkout/pix/:orderId', PaymentController.pixPage);
router.get('/meus-pedidos', OrderController.historyPage);
router.post('/orders/:id/delete', OrderController.deleteOrder);

// Payment Status Routes
router.get('/payment/success', (req, res) => res.render('shop/payment-success', { layout: 'main' }));
router.get('/payment/failure', (req, res) => res.render('shop/payment-failure', { layout: 'main' }));
router.get('/payment/pending', (req, res) => res.render('shop/payment-pending', { layout: 'main' }));

// Home & Public
router.get('/', HomeController.index);
router.get('/campanhas', (req, res) => {
  res.render('campanhas-page', { 
    title: 'Campanhas - Camisaria Mendes',
    layout: 'main',
    whatsappLink: `https://wa.me/${process.env.WHATSAPP_NUMBER}`,
    instagramLink: `https://instagram.com/${process.env.INSTAGRAM_USER}`,
    emailLink: `mailto:${process.env.CONTACT_EMAIL}`,
    contactEmail: process.env.CONTACT_EMAIL,
    instagramUser: `@${process.env.INSTAGRAM_USER}`,
    displayPhone: '(98) 98778-0960'
  });
});
router.get('/como-funciona', (req, res) => {
  res.render('como-funciona-page', { 
    title: 'Como funciona - Camisaria Mendes',
    layout: 'main'
  });
});
router.get('/contato', (req, res) => {
  res.render('contato-page', { 
    title: 'Contato - Camisaria Mendes',
    layout: 'main'
  });
});
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
