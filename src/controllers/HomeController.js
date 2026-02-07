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
};
