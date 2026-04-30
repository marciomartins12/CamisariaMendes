const { Campaign, Shirt } = require('../models');

const normalizeSizesList = (rawSizes) => {
  if (!rawSizes) return [];
  if (Array.isArray(rawSizes)) {
    return rawSizes.map(s => String(s).trim()).filter(Boolean);
  }
  if (typeof rawSizes !== 'string') return [];

  const value = rawSizes.trim();
  if (!value) return [];

  if (value.startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(s => String(s).trim()).filter(Boolean);
      }
    } catch (e) {
      // Fallback to separator parsing
    }
  }

  return value
    .split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
};

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
        return res.render('campanhas-page', {
            title: 'Campanhas - Camisaria Mendes',
            layout: 'main',
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
         return res.render('campanhas-page', {
            title: 'Campanhas - Camisaria Mendes',
            layout: 'main',
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
      res.render('campanhas-page', {
          title: 'Campanhas - Camisaria Mendes',
          layout: 'main',
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

      const today = new Date().toISOString().slice(0, 10);
      const endDateISO = campaign.endDate ? campaign.endDate.toString().slice(0, 10) : null;
      const isExpired = endDateISO && endDateISO < today;

      if (campaign.status !== 'active' || isExpired) {
          if (isExpired && campaign.status === 'active') {
              try {
                  await campaign.update({ status: 'inactive' });
              } catch (e) {
                  console.error('Erro ao atualizar status da campanha expirada:', e);
              }
          }
          return res.render('campanhas-page', {
              title: 'Campanhas - Camisaria Mendes',
              layout: 'main',
              error: 'Esta campanha não está ativa no momento.',
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

      // Normalize images field for each shirt into an array
      if (campaignPlain.shirts) {
        campaignPlain.shirts.forEach(shirt => {
          if (!shirt.images) {
            shirt.images = [];
          } else if (typeof shirt.images === 'string') {
            try {
              // Try parse JSON array stored as string
              const parsed = JSON.parse(shirt.images);
              shirt.images = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
            } catch (e) {
              // Fallback: treat as single URL string
              shirt.images = [shirt.images];
            }
          } else if (!Array.isArray(shirt.images)) {
            // Any other type, wrap as single element
            shirt.images = [shirt.images];
          }
          shirt.sizesList = normalizeSizesList(shirt.sizes);
        });
      }

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
