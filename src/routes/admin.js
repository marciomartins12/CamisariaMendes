const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { Admin, Campaign, Shirt } = require('../models');

// Helper to generate unique access code
const generateAccessCode = async () => {
    let code;
    let exists = true;
    while (exists) {
        code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const campaign = await Campaign.findOne({ where: { accessCode: code } });
        if (!campaign) exists = false;
    }
    return code;
};

// Middleware to require login
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.admin) {
        return next();
    }
    return res.redirect('/admin/login');
};

// Login GET
router.get('/login', (req, res) => {
    if (req.session && req.session.admin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { 
        title: 'Login Admin - Camisaria Mendes',
        layout: 'main'
    });
});

// Login POST
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const admin = await Admin.findOne({ where: { username } });
        
        if (admin) {
            const match = await bcrypt.compare(password, admin.password);
            
            if (match) {
                req.session.admin = {
                    id: admin.id,
                    username: admin.username,
                    email: admin.email,
                    role: admin.role
                };
                return res.redirect('/admin/dashboard');
            }
        }
        
        res.render('admin/login', { 
            title: 'Login Admin - Camisaria Mendes',
            error: 'Usuário ou senha inválidos',
            layout: 'main'
        });
    } catch (error) {
        console.error('Login error:', error);
        res.render('admin/login', { 
            title: 'Login Admin - Camisaria Mendes',
            error: 'Erro interno ao realizar login',
            layout: 'main'
        });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.admin = null;
    res.redirect('/admin/login');
});

// Dashboard
router.get('/dashboard', requireAdmin, async (req, res) => {
    try {
        const campaignCount = await Campaign.count({ where: { status: 'active' } });
        res.render('admin/dashboard', {
            title: 'Dashboard - Camisaria Mendes',
            layout: 'main',
            isDashboard: true,
            campaignCount
        });
    } catch (error) {
        console.error(error);
        res.render('admin/dashboard', {
            title: 'Dashboard - Camisaria Mendes',
            layout: 'main',
            isDashboard: true,
            campaignCount: 0
        });
    }
});

// === Profile Routes ===
router.get('/perfil', requireAdmin, async (req, res) => {
    res.render('admin/profile', {
        title: 'Meu Perfil',
        layout: 'main',
        isProfile: true,
        admin: req.session.admin
    });
});

router.post('/perfil', requireAdmin, async (req, res) => {
    const { email, password, confirmPassword } = req.body;
    const adminId = req.session.admin.id;

    try {
        const admin = await Admin.findByPk(adminId);
        
        if (!admin) {
            return res.redirect('/admin/logout');
        }

        // Update email
        if (email && email !== admin.email) {
            admin.email = email;
            req.session.admin.email = email; // Update session
        }

        // Update password if provided
        if (password) {
            if (password !== confirmPassword) {
                return res.render('admin/profile', {
                    title: 'Meu Perfil',
                    layout: 'main',
                    isProfile: true,
                    error: 'As senhas não coincidem.',
                    admin: req.session.admin
                });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            admin.password = hashedPassword;
        }

        await admin.save();

        res.render('admin/profile', {
            title: 'Meu Perfil',
            layout: 'main',
            isProfile: true,
            success: 'Perfil atualizado com sucesso!',
            admin: req.session.admin
        });

    } catch (error) {
        console.error(error);
        res.render('admin/profile', {
            title: 'Meu Perfil',
            layout: 'main',
            isProfile: true,
            error: 'Erro ao atualizar perfil.',
            admin: req.session.admin
        });
    }
});

// === Campaign Routes ===
router.get('/campanhas', requireAdmin, async (req, res) => {
    try {
        const campaigns = await Campaign.findAll({ order: [['createdAt', 'DESC']] });
        // Convert to plain objects for Handlebars
        const campaignsPlain = campaigns.map(c => c.get({ plain: true }));

        res.render('admin/campaigns', {
            title: 'Gerenciar Campanhas',
            layout: 'main',
            isCampaigns: true,
            campaigns: campaignsPlain
        });
    } catch (error) {
        console.error(error);
        res.render('admin/campaigns', {
            title: 'Gerenciar Campanhas',
            layout: 'main',
            isCampaigns: true,
            error: 'Erro ao carregar campanhas.'
        });
    }
});

router.get('/campanhas/nova', requireAdmin, (req, res) => {
    res.render('admin/campaign-form', {
        title: 'Nova Campanha',
        layout: 'main',
        isCampaigns: true
    });
});

router.post('/campanhas/nova', requireAdmin, async (req, res) => {
    try {
        const { 
            title, description, clientName, clientPhone, clientInstagram, 
            status, startDate, endDate, 
            shirtNames, shirtColors, shirtTypes, shirtPrices, shirtSizes, shirtImagesJSON 
        } = req.body;

        const accessCode = await generateAccessCode();
        
        // Convert array inputs to array if single item
        const ensureArray = (item) => Array.isArray(item) ? item : (item ? [item] : []);
        
        const names = ensureArray(shirtNames);
        const colors = ensureArray(shirtColors);
        const types = ensureArray(shirtTypes);
        const prices = ensureArray(shirtPrices);
        const sizes = ensureArray(shirtSizes);
        const imagesJSON = ensureArray(shirtImagesJSON);

        const newCampaign = await Campaign.create({
            title,
            description,
            clientName,
            clientPhone,
            clientInstagram,
            accessCode,
            status,
            startDate: startDate || null,
            endDate: endDate || null
        });

        // Create shirts
        if (names.length > 0) {
            const shirtsData = names.map((name, index) => ({
                name,
                color: colors[index] || '',
                type: types[index] || 'Tradicional',
                price: prices[index] || 0,
                sizes: sizes[index] || '',
                images: JSON.parse(imagesJSON[index] || '[]'), // JSON Array of Base64 strings
                campaignId: newCampaign.id
            }));

            await Shirt.bulkCreate(shirtsData);
        }
        
        res.render('admin/campaigns', {
            title: 'Gerenciar Campanhas',
            layout: 'main',
            isCampaigns: true,
            success: `Campanha criada com sucesso! Código de acesso: ${accessCode}`,
            campaigns: (await Campaign.findAll({ order: [['createdAt', 'DESC']] })).map(c => c.get({ plain: true }))
        });
    } catch (error) {
        console.error(error);
        res.render('admin/campaign-form', {
            title: 'Nova Campanha',
            layout: 'main',
            isCampaigns: true,
            error: 'Erro ao criar campanha.',
            campaign: req.body // Keep input data
        });
    }
});

router.get('/campanhas/editar/:id', requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.id);
        if (!campaign) {
            return res.redirect('/admin/campanhas');
        }
        res.render('admin/campaign-form', {
            title: 'Editar Campanha',
            layout: 'main',
            isCampaigns: true,
            campaign: campaign.get({ plain: true })
        });
    } catch (error) {
        console.error(error);
        res.redirect('/admin/campanhas');
    }
});

router.post('/campanhas/editar/:id', requireAdmin, async (req, res) => {
    try {
        const { 
            title, description, status, startDate, endDate,
            clientName, clientPhone, clientInstagram,
            shirtNames, shirtColors, shirtTypes, shirtPrices, shirtSizes, shirtImagesJSON 
        } = req.body;
        
        const campaign = await Campaign.findByPk(req.params.id);
        
        if (!campaign) {
            return res.redirect('/admin/campanhas');
        }

        campaign.title = title;
        campaign.description = description;
        campaign.status = status;
        campaign.clientName = clientName;
        campaign.clientPhone = clientPhone;
        campaign.clientInstagram = clientInstagram;
        campaign.startDate = startDate || null;
        campaign.endDate = endDate || null;
        
        await campaign.save();

        // Update shirts: Strategy -> Delete all and Re-create
        // This is simple but effective given we don't have orders yet
        await Shirt.destroy({ where: { campaignId: campaign.id } });

        const ensureArray = (item) => Array.isArray(item) ? item : (item ? [item] : []);
        
        const names = ensureArray(shirtNames);
        const colors = ensureArray(shirtColors);
        const types = ensureArray(shirtTypes);
        const prices = ensureArray(shirtPrices);
        const sizes = ensureArray(shirtSizes);
        const imagesJSON = ensureArray(shirtImagesJSON);

        if (names.length > 0) {
            const shirtsData = names.map((name, index) => ({
                name,
                color: colors[index] || '',
                type: types[index] || 'Tradicional',
                price: prices[index] || 0,
                sizes: sizes[index] || '',
                images: JSON.parse(imagesJSON[index] || '[]'),
                campaignId: campaign.id
            }));

            await Shirt.bulkCreate(shirtsData);
        }

        res.render('admin/campaigns', {
            title: 'Gerenciar Campanhas',
            layout: 'main',
            isCampaigns: true,
            success: 'Campanha atualizada com sucesso!',
            campaigns: (await Campaign.findAll({ order: [['createdAt', 'DESC']] })).map(c => c.get({ plain: true }))
        });
    } catch (error) {
        console.error(error);
        res.render('admin/campaign-form', {
            title: 'Editar Campanha',
            layout: 'main',
            isCampaigns: true,
            error: 'Erro ao atualizar campanha.',
            campaign: { ...req.body, id: req.params.id }
        });
    }
});

router.post('/campanhas/deletar/:id', requireAdmin, async (req, res) => {
    try {
        await Campaign.destroy({ where: { id: req.params.id } });
        res.redirect('/admin/campanhas');
    } catch (error) {
        console.error(error);
        res.redirect('/admin/campanhas');
    }
});

// Root Admin redirect
router.get('/', (req, res) => {
    if (req.session && req.session.admin) {
        res.redirect('/admin/dashboard');
    } else {
        res.redirect('/admin/login');
    }
});

module.exports = router;
