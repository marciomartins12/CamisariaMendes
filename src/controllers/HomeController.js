module.exports = {
  index: (req, res) => {
    res.render('home', {
      title: 'Camisaria Mendes',
      whatsappLink: `https://wa.me/${process.env.WHATSAPP_NUMBER}`,
      instagramLink: `https://instagram.com/${process.env.INSTAGRAM_USER}`,
      emailLink: `mailto:${process.env.CONTACT_EMAIL}`,
    });
  },
};
