const path = require('path');
const express = require('express');
const flash = require('express-flash');
const session = require('express-session');
const { sessionConfig, initializeStore } = require('../config/session');

module.exports = async (app) => {
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(session(sessionConfig));
  await initializeStore();
  app.use(flash());

  // Global variables for templates
  app.use((req, res, next) => {
    res.locals.whatsappLink = `https://wa.me/${process.env.WHATSAPP_NUMBER}`;
    res.locals.instagramLink = `https://instagram.com/${process.env.INSTAGRAM_USER}`;
    res.locals.emailLink = `mailto:${process.env.CONTACT_EMAIL}`;
    res.locals.contactEmail = process.env.CONTACT_EMAIL;
    res.locals.instagramUser = `@${process.env.INSTAGRAM_USER}`;
    
    // Format phone for display (ex: 5598987780960 -> (98) 98778-0960)
    const rawPhone = process.env.WHATSAPP_NUMBER || '';
    let formattedPhone = rawPhone;
    if (rawPhone.length >= 12) { // 55 + 2 (DDD) + 9 (num)
        formattedPhone = `(${rawPhone.substring(2,4)}) ${rawPhone.substring(4,9)}-${rawPhone.substring(9)}`;
    }
    res.locals.displayPhone = formattedPhone;

    res.locals.admin = req.session.admin; // Make admin user available in all views
    res.locals.user = req.session.user; // Make customer user available in all views
    
    // Flash messages
    const success = req.flash('success');
    const error = req.flash('error');
    res.locals.success = success.length > 0 ? success[0] : null;
    res.locals.error = error.length > 0 ? error[0] : null;

    next();
  });
};
