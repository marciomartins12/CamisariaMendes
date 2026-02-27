const bcrypt = require('bcrypt');
const { User, Campaign, Shirt, Admin } = require('../models');
const EmailService = require('../services/EmailService');

module.exports = {
    // Show Login/Register Page
    loginPage: async (req, res) => {
        const { code } = req.query; // Campaign access code passed as query param
        
        // If user is already logged in
        if (req.session && req.session.user) {
            if (code) {
                return res.redirect(`/c/${code}`);
            }
            return res.redirect('/campanhas');
        }

        res.render('user/auth', {
            title: 'Identifique-se - Camisaria Mendes',
            campaignCode: code,
            layout: 'main' // Or a simpler layout if preferred
        });
    },

    // Handle Login
    login: async (req, res) => {
        const { email, password, campaignCode } = req.body;

        try {
            // 1) Tentar autenticar como Admin (email)
            const admin = await Admin.findOne({ where: { email } });
            if (admin) {
                const adminMatch = await bcrypt.compare(password, admin.password);
                if (adminMatch) {
                    req.session.user = null;
                    req.session.admin = {
                        id: admin.id,
                        username: admin.username,
                        email: admin.email,
                        role: admin.role
                    };
                    return res.redirect('/admin/dashboard');
                }
            }

            // 2) Se não for admin, tentar como usuário comum
            const user = await User.findOne({ where: { email } });

            if (user) {
                const match = await bcrypt.compare(password, user.password);
                if (match) {
                    req.session.admin = null;
                    req.session.user = {
                        id: user.id,
                        name: user.name,
                        email: user.email,
                        phone: user.phone
                    };
                    
                    if (campaignCode) {
                        return res.redirect(`/c/${campaignCode}`);
                    }
                    return res.redirect('/campanhas');
                }
            }

            req.session.user = null;
            req.session.admin = null;

            res.render('user/auth', {
                title: 'Identifique-se - Camisaria Mendes',
                campaignCode,
                error: 'E-mail ou senha inválidos.',
                activeTab: 'login'
            });

        } catch (error) {
            console.error(error);
            res.render('user/auth', {
                title: 'Identifique-se - Camisaria Mendes',
                campaignCode,
                error: 'Erro ao realizar login.',
                activeTab: 'login'
            });
        }
    },

    // Handle Register
    register: async (req, res) => {
        const { name, email, phone, password, confirmPassword, campaignCode } = req.body;

        try {
            if (password !== confirmPassword) {
                return res.render('user/auth', {
                    title: 'Identifique-se - Camisaria Mendes',
                    campaignCode,
                    error: 'As senhas não coincidem.',
                    activeTab: 'register',
                    oldData: req.body
                });
            }

            const existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                return res.render('user/auth', {
                    title: 'Identifique-se - Camisaria Mendes',
                    campaignCode,
                    error: 'Este e-mail já está cadastrado.',
                    activeTab: 'register',
                    oldData: req.body
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await User.create({
                name,
                email,
                phone,
                password: hashedPassword
            });

            // Auto login
            req.session.user = {
                id: newUser.id,
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone
            };

            if (campaignCode) {
                return res.redirect(`/c/${campaignCode}`);
            }
            return res.redirect('/campanhas');

        } catch (error) {
            console.error(error);
            res.render('user/auth', {
                title: 'Identifique-se - Camisaria Mendes',
                campaignCode,
                error: 'Erro ao criar conta.',
                activeTab: 'register',
                oldData: req.body
            });
        }
    },

    // Forgot Password
    forgotPassword: async (req, res) => {
        const { email, campaignCode } = req.body;

        try {
            const user = await User.findOne({ where: { email } });

            if (!user) {
                return res.render('user/auth', {
                    title: 'Identifique-se - Camisaria Mendes',
                    campaignCode,
                    error: 'E-mail não encontrado.',
                    activeTab: 'forgot'
                });
            }

            // Generate random password (8 chars)
            const newPassword = Math.random().toString(36).slice(-8).toUpperCase();
            
            // Hash password
            const hashedPassword = await bcrypt.hash(newPassword, 10);

            // Update user
            user.password = hashedPassword;
            await user.save();

            // Send email
            const emailSent = await EmailService.sendNewPassword(user.email, newPassword);

            if (emailSent) {
                return res.render('user/auth', {
                    title: 'Identifique-se - Camisaria Mendes',
                    campaignCode,
                    success: 'Uma nova senha foi enviada para o seu e-mail.',
                    activeTab: 'login'
                });
            } else {
                return res.render('user/auth', {
                    title: 'Identifique-se - Camisaria Mendes',
                    campaignCode,
                    error: 'Erro ao enviar e-mail. Tente novamente mais tarde.',
                    activeTab: 'forgot'
                });
            }

        } catch (error) {
            console.error(error);
            return res.render('user/auth', {
                title: 'Identifique-se - Camisaria Mendes',
                campaignCode,
                error: 'Erro ao processar solicitação.',
                activeTab: 'forgot'
            });
        }
    },

    logout: (req, res) => {
        req.session.user = null;
        res.redirect('/');
    }
};
