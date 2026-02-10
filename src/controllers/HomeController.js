const { Campaign, Shirt } = require('../models');

module.exports = {
  index: (req, res) => {
    res.render('home', {
      title: 'Camisaria Mendes',
      whatsappLink: `https://wa.me/${process.env.WHATSAPP_NUMBER}`,
      instagramLink: `https://instagram.com/${process.env.INSTAGRAM_USER}`,
      emailLink: `mailto:${process.env.CONTACT_EMAIL}`,
      contactEmail: process.env.CONTACT_EMAIL,
      instagramUser: `@${process.env.INSTAGRAM_USER}`,
      displayPhone: '(98) 98778-0960' // Hardcoded format based on env for now, or use a library if available
    });
  },

  accessCampaign: async (req, res) => {
    const codigo = req.body.codigo ? req.body.codigo.toUpperCase().trim() : '';
    
    try {
      // Find campaign by access code
      const campaign = await Campaign.findOne({ where: { accessCode: codigo } });
      
      if (!campaign) {
        return res.render('home', {
            title: 'Camisaria Mendes',
            error: 'Código de campanha inválido. Verifique e tente novamente.',
            displayPhone: '(98) 98778-0960',
            contactEmail: process.env.CONTACT_EMAIL,
            instagramUser: `@${process.env.INSTAGRAM_USER}`,
            whatsappLink: `https://wa.me/${process.env.WHATSAPP_NUMBER}`,
            instagramLink: `https://instagram.com/${process.env.INSTAGRAM_USER}`,
            emailLink: `mailto:${process.env.CONTACT_EMAIL}`
        });
      }

      if (campaign.status !== 'active') {
         return res.render('home', {
            title: 'Camisaria Mendes',
            error: 'Esta campanha não está ativa no momento.',
            displayPhone: '(98) 98778-0960',
            contactEmail: process.env.CONTACT_EMAIL,
            instagramUser: `@${process.env.INSTAGRAM_USER}`,
            whatsappLink: `https://wa.me/${process.env.WHATSAPP_NUMBER}`,
            instagramLink: `https://instagram.com/${process.env.INSTAGRAM_USER}`,
            emailLink: `mailto:${process.env.CONTACT_EMAIL}`
         });
      }

      // Redirect to the campaign page (using code in URL)
      res.redirect(`/c/${campaign.accessCode}`);

    } catch (error) {
      console.error(error);
      res.render('home', {
          title: 'Camisaria Mendes',
          error: 'Erro ao processar sua solicitação.',
          displayPhone: '(98) 98778-0960',
          contactEmail: process.env.CONTACT_EMAIL,
          instagramUser: `@${process.env.INSTAGRAM_USER}`,
          whatsappLink: `https://wa.me/${process.env.WHATSAPP_NUMBER}`,
          instagramLink: `https://instagram.com/${process.env.INSTAGRAM_USER}`,
          emailLink: `mailto:${process.env.CONTACT_EMAIL}`
      });
    }
  },

  viewCampaign: async (req, res) => {
    const code = req.params.code ? req.params.code.toUpperCase().trim() : '';

    try {
      // 1. Check if user is logged in
      if (!req.session.user) {
        return res.redirect(`/auth/login?code=${code}`);
      }

      // 2. Find campaign
      const campaign = await Campaign.findOne({ 
        where: { accessCode: code },
        include: [{ model: Shirt, as: 'shirts' }]
      });

      if (!campaign) {
        return res.redirect('/');
      }

      if (campaign.status !== 'active') {
          return res.render('home', {
              title: 'Camisaria Mendes',
              error: 'Esta campanha não está ativa no momento.',
              // ... existing locals ...
              whatsappLink: `https://wa.me/${process.env.WHATSAPP_NUMBER}`,
              instagramLink: `https://instagram.com/${process.env.INSTAGRAM_USER}`,
              emailLink: `mailto:${process.env.CONTACT_EMAIL}`,
              contactEmail: process.env.CONTACT_EMAIL,
              instagramUser: `@${process.env.INSTAGRAM_USER}`,
              displayPhone: '(98) 98778-0960'
          });
      }

      // Convert to plain object for Handlebars
      const campaignPlain = campaign.get({ plain: true });

      // 3. Render Store Page (instead of generic campaign page)
      res.render('shop/store', {
        title: campaign.title,
        campaign: campaignPlain,
        user: req.session.user,
        // whatsappNumber is now handled by middleware globally as whatsappLink or similar, 
        // but if store.handlebars specifically needs the raw number:
        whatsappNumber: process.env.WHATSAPP_NUMBER, 
        layout: 'main'
      });
    } catch (error) {
      console.error(error);
      res.redirect('/');
    }
  }
};
