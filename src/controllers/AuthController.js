const bcrypt = require('bcrypt');
const { User, Campaign, Shirt, Admin } = require('../models');

module.exports = {
    // Show Login/Register Page
    loginPage: async (req, res) => {
        const { code } = req.query; // Campaign access code passed as query param
        
        // If user is already logged in, redirect back to campaign
        if (req.session && req.session.user && code) {
            return res.redirect(`/c/${code}`);
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
                        email: user.email
                    };
                    
                    if (campaignCode) {
                        return res.redirect(`/c/${campaignCode}`);
                    }
                    return res.redirect('/');
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
                email: newUser.email
            };

            if (campaignCode) {
                return res.redirect(`/c/${campaignCode}`);
            }
            return res.redirect('/');

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

    logout: (req, res) => {
        req.session.user = null;
        res.redirect('/');
    }
};
