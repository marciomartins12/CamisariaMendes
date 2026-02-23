const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { Admin, Campaign, Shirt, Coupon, sequelize, User, Order } = require('../models');

// Middleware to mark as admin area for all routes in this file
router.use((req, res, next) => {
    res.locals.isAdminArea = true;
    next();
});

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

const parseBrazilianDateToISO = (value) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.includes('-')) {
        const parts = trimmed.split('-');
        if (parts.length !== 3) return null;
        const [year, month, day] = parts;
        if (!day || !month || !year) return null;
        const d = day.padStart(2, '0');
        const m = month.padStart(2, '0');
        return `${year}-${m}-${d}`;
    }
    const parts = trimmed.split('/');
    if (parts.length !== 3) return null;
    const [day, month, year] = parts;
    if (!day || !month || !year) return null;
    const d = day.padStart(2, '0');
    const m = month.padStart(2, '0');
    return `${year}-${m}-${d}`;
};

const computeStatusFromEndDateISO = (isoEndDate) => {
    if (!isoEndDate) return 'active';
    const today = new Date().toISOString().slice(0, 10);
    return isoEndDate < today ? 'inactive' : 'active';
};

// Middleware to require login
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.admin) {
        return next();
    }
    return res.redirect('/admin/login');
};

// Middleware to require super admin
const requireSuperAdmin = (req, res, next) => {
    if (req.session && req.session.admin && req.session.admin.role === 'superadmin') {
        return next();
    }
    return res.redirect('/admin/dashboard');
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
        const campaigns = await Campaign.findAll({ 
            include: [{ model: Shirt, as: 'shirts' }],
            order: [['createdAt', 'DESC']] 
        });
        
        const statusUpdates = [];
        const campaignsPlain = campaigns.map(c => {
            const plain = c.get({ plain: true });
            const computedStatus = computeStatusFromEndDateISO(plain.endDate);
            if (computedStatus && plain.status !== computedStatus) {
                statusUpdates.push(c.update({ status: computedStatus }));
                plain.status = computedStatus;
            }
            plain.productCount = plain.shirts ? plain.shirts.length : 0;
            plain.totalRevenue = 0;
            plain.totalOrders = 0;
            return plain;
        });

        if (statusUpdates.length) {
            await Promise.all(statusUpdates);
        }

        // Compute metrics: total approved orders and approved revenue per campaign
        try {
            const approvedOrders = await Order.findAll({
                where: { status: 'approved' },
                attributes: [
                    'id',
                    'status',
                    'finalAmount',
                    'items',
                    'customerName',
                    'customerEmail',
                    'customerPhone',
                    'createdAt'
                ]
            });

            const normalizedApproved = approvedOrders.map(order => {
                const o = order.get({ plain: true });
                try {
                    if (typeof o.items === 'string') {
                        o.items = JSON.parse(o.items);
                        if (typeof o.items === 'string') {
                            o.items = JSON.parse(o.items);
                        }
                    }
                } catch (e) {
                    o.items = [];
                }
                if (!Array.isArray(o.items)) o.items = [];
                const itemIds = o.items
                    .map(it => {
                        const pid = it && (it.id ?? it.productId ?? it.shirtId);
                        const num = Number(pid);
                        return Number.isFinite(num) ? num : null;
                    })
                    .filter(v => v !== null);
                return { ...o, itemIds };
            });

            campaignsPlain.forEach(cp => {
                const shirtIds = (cp.shirts || []).map(s => Number(s.id)).filter(Number.isFinite);
                const shirtNames = (cp.shirts || [])
                    .map(s => (s.name || '').trim())
                    .filter(Boolean);
                let ordersCount = 0;
                let revenueSum = 0;
                normalizedApproved.forEach(o => {
                    const matchById = o.itemIds.some(id => shirtIds.includes(id));
                    let has = matchById;
                    if (!has && o.items && o.items.length && shirtNames.length) {
                        has = o.items.some(it => {
                            if (!it || typeof it.name !== 'string') return false;
                            return shirtNames.includes(it.name.trim());
                        });
                    }
                    if (has) {
                        ordersCount += 1;
                        const val = parseFloat(o.finalAmount) || 0;
                        revenueSum += val;
                    }
                });
                cp.totalOrders = ordersCount;
                cp.totalRevenue = revenueSum;
                try {
                    cp.totalRevenueFormatted = revenueSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } catch (e) {
                    cp.totalRevenueFormatted = `${revenueSum.toFixed(2)}`;
                }
            });
        } catch (metricsErr) {
            console.error('Erro ao calcular métricas de campanhas:', metricsErr);
        }

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

router.get('/campanhas/debug/:id', requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.id, {
            include: [{ model: Shirt, as: 'shirts' }]
        });

        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        const campaignPlain = campaign.get({ plain: true });
        const shirtIds = campaignPlain.shirts ? campaignPlain.shirts.map(s => Number(s.id)).filter(Number.isFinite) : [];
        const shirtNames = campaignPlain.shirts
            ? campaignPlain.shirts
                .map(s => (s.name || '').trim())
                .filter(Boolean)
            : [];

        const approvedOrders = await Order.findAll({
            where: { status: 'approved' },
            attributes: ['id', 'status', 'finalAmount', 'items', 'customerName', 'customerEmail', 'customerPhone', 'createdAt']
        });
        const debugOrders = approvedOrders.map(order => {
            const o = order.get({ plain: true });
            let items = o.items;
            try {
                if (typeof items === 'string') {
                    items = JSON.parse(items);
                    if (typeof items === 'string') {
                        items = JSON.parse(items);
                    }
                }
            } catch (e) {
                items = [];
            }
            if (!Array.isArray(items)) items = [];

            const itemIds = items
                .map(it => {
                    const pid = it && (it.id ?? it.productId ?? it.shirtId);
                    const num = Number(pid);
                    return Number.isFinite(num) ? num : null;
                })
                .filter(v => v !== null);

            const matchById = itemIds.some(id => shirtIds.includes(id));
            let matchByName = false;
            if (!matchById && items.length && shirtNames.length) {
                matchByName = items.some(it => {
                    if (!it || typeof it.name !== 'string') return false;
                    return shirtNames.includes(it.name.trim());
                });
            }

            return {
                id: o.id,
                status: o.status,
                finalAmount: o.finalAmount,
                customerName: o.customerName,
                customerEmail: o.customerEmail,
                customerPhone: o.customerPhone,
                itemIds,
                itemsCount: items.length,
                matchesCampaignById: matchById,
                matchesCampaignByName: matchByName
            };
        });

        const matched = debugOrders.filter(o => o.matchesCampaignById || o.matchesCampaignByName);

        return res.json({
            campaignId: campaignPlain.id,
            campaignTitle: campaignPlain.title,
            shirtIds,
            shirtNames,
            totalApprovedOrdersInSystem: debugOrders.length,
            totalMatchedOrdersForCampaign: matched.length,
            matchedOrders: matched
        });
    } catch (error) {
        console.error('Erro em /admin/campanhas/debug:', error);
        return res.status(500).json({
            error: 'Erro interno ao gerar debug de campanha',
            errorMessage: error && error.message ? error.message : null,
            errorName: error && error.name ? error.name : null
        });
    }
});

router.get('/campanhas/debug-raw/:id', requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.id, {
            include: [{ model: Shirt, as: 'shirts' }]
        });

        if (!campaign) {
            return res.status(404).json({ error: 'Campanha não encontrada' });
        }

        const campaignPlain = campaign.get({ plain: true });
        const approvedOrders = await Order.findAll({
            where: { status: 'approved' },
            attributes: ['id', 'status', 'finalAmount', 'items', 'customerName', 'customerEmail', 'customerPhone', 'createdAt', 'userId']
        });

        const ordersPlain = approvedOrders.map(order => {
            const o = order.get({ plain: true });
            return o;
        });

        return res.json({
            campaign: campaignPlain,
            approvedOrders: ordersPlain
        });
    } catch (error) {
        console.error('Erro em /admin/campanhas/debug-raw:', error);
        return res.status(500).json({
            error: 'Erro interno ao gerar debug raw de campanha',
            errorMessage: error && error.message ? error.message : null,
            errorName: error && error.name ? error.name : null
        });
    }
});

// Toggle Campaign Status
router.post('/campanhas/toggle-status/:id', requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.id);
        if (!campaign) {
            return res.status(404).json({ success: false, message: 'Campanha não encontrada' });
        }

        // Toggle logic: active -> inactive, anything else -> active
        const newStatus = campaign.status === 'active' ? 'inactive' : 'active';
        
        await campaign.update({ status: newStatus });
        res.json({ success: true, newStatus, message: `Status alterado para ${newStatus === 'active' ? 'Ativa' : 'Inativa'}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'Erro ao alterar status' });
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
    const t = await sequelize.transaction();
    try {
        const { 
            title, description, clientName, clientPhone, clientInstagram, 
            endDate, 
            shirtNames, shirtColors, shirtTypes, shirtPrices, shirtSizes, shirtImagesJSON 
        } = req.body;

        const endDateISO = parseBrazilianDateToISO(endDate);
        if (endDate && !endDateISO) {
            await t.rollback();
            return res.render('admin/campaign-form', {
                title: 'Nova Campanha',
                layout: 'main',
                isCampaigns: true,
                error: 'Data de término inválida.',
                campaign: req.body
            });
        }

        const todayISO = new Date().toISOString().slice(0, 10);
        const status = computeStatusFromEndDateISO(endDateISO);

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
            startDate: todayISO,
            endDate: endDateISO || null
        }, { transaction: t });

        // Create shirts
        if (names.length > 0) {
            const shirtsData = names.map((name, index) => {
                let images = [];
                try {
                    images = JSON.parse(imagesJSON[index] || '[]');
                } catch (e) {
                    console.error('Error parsing images JSON:', e);
                    images = [];
                }

                return {
                    name,
                    color: colors[index] || '',
                    type: types[index] || 'Tradicional',
                    price: prices[index] || 0,
                    sizes: sizes[index] || '',
                    images: images,
                    campaignId: newCampaign.id
                };
            });

            await Shirt.bulkCreate(shirtsData, { transaction: t });
        }
        
        await t.commit();

        req.flash('success', `Campanha criada com sucesso! Código de acesso: ${accessCode}`);
        res.redirect('/admin/campanhas');
    } catch (error) {
        await t.rollback();
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

// Campaign Details
router.get('/campanhas/detalhes/:id', requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.id, {
            include: [{ model: Shirt, as: 'shirts' }]
        });
        
        if (!campaign) {
            return res.redirect('/admin/campanhas');
        }

        const campaignPlain = campaign.get({ plain: true });
        
        if (campaignPlain.shirts) {
            campaignPlain.shirts.forEach(shirt => {
                if (typeof shirt.images === 'string') {
                    try {
                        shirt.images = JSON.parse(shirt.images);
                    } catch (e) {
                        shirt.images = [];
                    }
                }
            });
        }

        const now = new Date();
        const endDate = campaignPlain.endDate ? new Date(campaignPlain.endDate) : null;
        if (endDate && !isNaN(endDate.getTime())) {
            const timeDiff = endDate.getTime() - now.getTime();
            const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));
            campaignPlain.daysRemaining = daysRemaining > 0 ? daysRemaining : 0;
        } else {
            campaignPlain.daysRemaining = 0;
        }

        const shirtIds = campaignPlain.shirts
            ? campaignPlain.shirts
                .map(s => Number(s.id))
                .filter(Number.isFinite)
            : [];
        const shirtNames = campaignPlain.shirts
            ? campaignPlain.shirts
                .map(s => (s.name || '').trim())
                .filter(Boolean)
            : [];

        // Load orders and link to this campaign via items -> shirtId
        let ordersForCampaign = [];
        let totalOrders = 0;
        let totalRevenue = 0;

        if (shirtIds.length > 0) {
            try {
                const allOrders = await Order.findAll({
                    where: { status: 'approved' },
                    attributes: ['id', 'status', 'finalAmount', 'items', 'customerName', 'customerEmail', 'customerPhone', 'paymentMethod', 'createdAt']
                });

                ordersForCampaign = allOrders
                    .map(order => {
                        const plain = order.get({ plain: true });
                        try {
                            if (typeof plain.items === 'string') {
                                plain.items = JSON.parse(plain.items);
                                if (typeof plain.items === 'string') {
                                    plain.items = JSON.parse(plain.items);
                                }
                            }
                            if (!Array.isArray(plain.items)) {
                                plain.items = [];
                            }
                        } catch (e) {
                            console.error(`Erro ao parsear itens do pedido ${plain.id}:`, e);
                            plain.items = [];
                        }

                        const hasItemFromCampaign = plain.items.some(it => {
                            const pid = it && (it.id ?? it.productId ?? it.shirtId);
                            const num = Number(pid);
                            return Number.isFinite(num) && shirtIds.includes(num);
                        }) || plain.items.some(it => {
                            if (!it || typeof it.name !== 'string' || !shirtNames.length) return false;
                            return shirtNames.includes(it.name.trim());
                        });
                        if (!hasItemFromCampaign) return null;

                        const customerName = plain.customerName || 'Cliente';
                        const customerEmail = plain.customerEmail || '';
                        const customerPhone = plain.customerPhone || '';

                        return {
                            ...plain,
                            customerName,
                            customerEmail,
                            customerPhone
                        };
                    })
                    .filter(o => o !== null);

                ordersForCampaign.forEach(o => {
                    totalOrders += 1;
                    const val = parseFloat(o.finalAmount) || 0;
                    totalRevenue += val;
                });
            } catch (ordersError) {
                console.error('Erro ao carregar pedidos da campanha:', ordersError);
                ordersForCampaign = [];
                totalOrders = 0;
                totalRevenue = 0;
            }
        }

        campaignPlain.totalOrders = totalOrders;
        campaignPlain.totalRevenue = totalRevenue;
        try {
            campaignPlain.totalRevenueFormatted = totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } catch (e) {
            campaignPlain.totalRevenueFormatted = `${totalRevenue.toFixed(2)}`;
        }

        let editingShirt = null;
        const editShirtId = req.query.editShirt;
        if (editShirtId && campaignPlain.shirts && campaignPlain.shirts.length) {
            editingShirt = campaignPlain.shirts.find(
                s => String(s.id) === String(editShirtId)
            ) || null;
        }

        res.render('admin/campaign-details', {
            title: 'Detalhes da Campanha',
            layout: 'main',
            isCampaigns: true,
            campaign: campaignPlain,
            editingShirt,
            orders: ordersForCampaign
        });
    } catch (error) {
        console.error(error);
        res.redirect('/admin/campanhas');
    }
});

router.post('/campanhas/:campaignId/camisas/deletar/:shirtId', requireAdmin, async (req, res) => {
    const { campaignId, shirtId } = req.params;
    try {
        await Shirt.destroy({ where: { id: shirtId } });
        req.flash('success', 'Produto removido da campanha com sucesso.');
        return res.redirect(`/admin/campanhas/detalhes/${campaignId}`);
    } catch (error) {
        console.error(error);
        return res.redirect(`/admin/campanhas/detalhes/${campaignId}`);
    }
});

router.post('/campanhas/:campaignId/camisas/editar/:shirtId', requireAdmin, async (req, res) => {
    try {
        const { campaignId, shirtId } = req.params;
        const { name, color, type, price, sizes, imagesJSON } = req.body;

        const shirt = await Shirt.findOne({ where: { id: shirtId, campaignId } });
        if (!shirt) {
            return res.redirect(`/admin/campanhas/detalhes/${campaignId}`);
        }

        let images = shirt.images;
        try {
            images = JSON.parse(imagesJSON || '[]');
        } catch (e) {
            images = shirt.images;
        }

        await shirt.update({
            name: name || shirt.name,
            color: color || '',
            type: type || 'Tradicional',
            price: price || 0,
            sizes: sizes || '',
            images: images || []
        });

        req.flash('success', 'Produto atualizado com sucesso.');
        res.redirect(`/admin/campanhas/detalhes/${campaignId}`);
    } catch (error) {
        console.error(error);
        res.redirect(`/admin/campanhas/detalhes/${req.params.campaignId}`);
    }
});

router.post('/campanhas/:campaignId/camisas/criar', requireAdmin, async (req, res) => {
    try {
        const { campaignId } = req.params;
        const { name, color, type, price, sizes, imagesJSON } = req.body;

        const campaign = await Campaign.findByPk(campaignId);
        if (!campaign) {
            return res.redirect('/admin/campanhas');
        }

        let images = [];
        try {
            images = JSON.parse(imagesJSON || '[]');
        } catch (e) {
            images = [];
        }

        await Shirt.create({
            name,
            color: color || '',
            type: type || 'Tradicional',
            price: price || 0,
            sizes: sizes || '',
            images: images || [],
            campaignId: campaign.id
        });

        req.flash('success', 'Novo produto adicionado à campanha.');
        res.redirect(`/admin/campanhas/detalhes/${campaignId}`);
    } catch (error) {
        console.error(error);
        res.redirect(`/admin/campanhas/detalhes/${req.params.campaignId}`);
    }
});

// Export Orders (CSV)
router.get('/campanhas/:id/exportar-pedidos', requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.id);
        if (!campaign) return res.redirect('/admin/campanhas');

        // Note: Order model does not exist yet. Returning template CSV.
        const headers = ['Data', 'Nome do Cliente', 'Telefone', 'Produto', 'Tipo', 'Tamanho', 'Preço', 'Status'];
        let csvContent = headers.join(';') + '\n';
        
        // Mock data or empty
        // csvContent += `2023-10-27;João Silva;11999999999;Camiseta A;Tradicional;M;50.00;Pago\n`;

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=pedidos-${campaign.accessCode}.csv`);
        res.send(csvContent);
    } catch (error) {
        console.error(error);
        res.redirect('/admin/campanhas');
    }
});

// Export Product Report (CSV)
router.get('/campanhas/:id/exportar-relatorio', requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.id, {
            include: [{ model: Shirt, as: 'shirts' }]
        });
        
        if (!campaign) return res.redirect('/admin/campanhas');

        const headers = ['Produto', 'Tipo', 'Cor', 'Preço', 'Tamanhos'];
        let csvContent = headers.join(';') + '\n';

        campaign.shirts.forEach(shirt => {
            // Clean sizes if they are JSON or string
            let sizes = shirt.sizes;
            if (Array.isArray(sizes)) sizes = sizes.join(',');
            
            // Escape semicolons if any
            const row = [
                shirt.name,
                shirt.type,
                shirt.color,
                shirt.price.toString().replace('.', ','),
                sizes
            ].map(field => `"${field}"`).join(';');
            
            csvContent += row + '\n';
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=produtos-${campaign.accessCode}.csv`);
        res.send(csvContent);
    } catch (error) {
        console.error(error);
        res.redirect('/admin/campanhas');
    }
});

router.get('/campanhas/editar/:id', requireAdmin, async (req, res) => {
    try {
        const campaign = await Campaign.findByPk(req.params.id, {
            include: [{ model: Shirt, as: 'shirts' }]
        });
        
        if (!campaign) {
            return res.redirect('/admin/campanhas');
        }
        const campaignPlain = campaign.get({ plain: true });

        res.render('admin/campaign-form', {
            title: 'Editar Campanha',
            layout: 'main',
            isCampaigns: true,
            campaign: campaignPlain
        });
    } catch (error) {
        console.error(error);
        res.redirect('/admin/campanhas');
    }
});

router.post('/campanhas/editar/:id', requireAdmin, async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const { 
            title, description, clientName, clientPhone, clientInstagram, 
            endDate,
            shirtNames, shirtColors, shirtTypes, shirtPrices, shirtSizes, shirtImagesJSON 
        } = req.body;

        const campaign = await Campaign.findByPk(id);
        
        if (!campaign) {
            await t.rollback();
            return res.redirect('/admin/campanhas');
        }

        const endDateISO = parseBrazilianDateToISO(endDate);
        if (endDate && !endDateISO) {
            await t.rollback();
            return res.render('admin/campaign-form', {
                title: 'Editar Campanha',
                layout: 'main',
                isCampaigns: true,
                error: 'Data de término inválida.',
                campaign: { id, ...req.body }
            });
        }

        const status = computeStatusFromEndDateISO(endDateISO);

        await campaign.update({
            title,
            description,
            clientName,
            clientPhone,
            clientInstagram,
            status,
            endDate: endDateISO || null
        }, { transaction: t });

        // Update shirts: Strategy -> Delete all and Re-create
        await Shirt.destroy({ where: { campaignId: campaign.id }, transaction: t });

        const ensureArray = (item) => Array.isArray(item) ? item : (item ? [item] : []);
        
        const names = ensureArray(shirtNames);
        const colors = ensureArray(shirtColors);
        const types = ensureArray(shirtTypes);
        const prices = ensureArray(shirtPrices);
        const sizes = ensureArray(shirtSizes);
        const imagesJSON = ensureArray(shirtImagesJSON);

        console.log(`Updating campaign ${id}. Found ${names.length} shirts to save.`);

        if (names.length > 0) {
            const shirtsData = names.map((name, index) => {
                let images = [];
                try {
                    images = JSON.parse(imagesJSON[index] || '[]');
                } catch (e) {
                    console.error('Error parsing images JSON for shirt index ' + index, e);
                    images = [];
                }
                
                return {
                    name,
                    color: colors[index] || '',
                    type: types[index] || 'Tradicional',
                    price: prices[index] || 0,
                    sizes: sizes[index] || '',
                    images: images,
                    campaignId: campaign.id
                };
            });

            await Shirt.bulkCreate(shirtsData, { transaction: t });
            console.log(`Successfully saved ${shirtsData.length} shirts for campaign ${id}.`);
        } else {
            console.log(`No shirts to save for campaign ${id}.`);
        }
        
        await t.commit();

        req.flash('success', 'Campanha atualizada com sucesso!');
        res.redirect('/admin/campanhas');
    } catch (error) {
        await t.rollback();
        console.error(error);
        res.render('admin/campaign-form', {
            title: 'Editar Campanha',
            layout: 'main',
            isCampaigns: true,
            error: 'Erro ao atualizar campanha.',
            campaign: { id: req.params.id, ...req.body }
        });
    }
});

router.post('/campanhas/deletar/:id', requireAdmin, async (req, res) => {
    try {
        await Campaign.destroy({ where: { id: req.params.id } });
        req.flash('success', 'Campanha excluída com sucesso.');
        res.redirect('/admin/campanhas');
    } catch (error) {
        console.error(error);
        res.redirect('/admin/campanhas');
    }
});

// === Orders Management (Admin) ===
router.post('/pedidos/:id/sincronizar', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id);
        if (!order) {
            req.flash('error', 'Pedido não encontrado.');
            return res.redirect('back');
        }

        // Use same logic as PaymentController.checkStatus (without reusing controller directly here)
        const mercadopago = require('mercadopago');
        const client = new mercadopago.MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
        const paymentSearch = new mercadopago.Payment(client);
        const searchResult = await paymentSearch.search({
            options: {
                external_reference: order.id.toString()
            }
        });

        if (searchResult.results && searchResult.results.length > 0) {
            const lastPayment = searchResult.results[searchResult.results.length - 1];

            const status = lastPayment.status;
            if (status === 'approved') {
                order.status = 'approved';
                order.paymentMethod = lastPayment.payment_method_id;
                order.transactionId = lastPayment.id.toString();
            } else if (status === 'rejected' || status === 'cancelled') {
                order.status = status;
            }
            await order.save();

            req.flash('success', 'Status do pedido sincronizado com sucesso.');
        } else {
            req.flash('info', 'Nenhum pagamento encontrado ainda para este pedido.');
        }

        return res.redirect('back');
    } catch (error) {
        console.error('Erro ao sincronizar pedido:', error);
        req.flash('error', 'Erro ao sincronizar status do pedido.');
        return res.redirect('back');
    }
});

router.post('/pedidos/:id/aprovar-manual', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id);
        if (!order) {
            req.flash('error', 'Pedido não encontrado.');
            return res.redirect('back');
        }

        order.status = 'approved';
        order.paymentMethod = order.paymentMethod || 'manual';
        order.transactionId = order.transactionId || `manual-${Date.now()}`;
        await order.save();

        req.flash('success', 'Pedido marcado como pago manualmente.');
        return res.redirect('back');
    } catch (error) {
        console.error('Erro ao aprovar manualmente pedido:', error);
        req.flash('error', 'Erro ao aprovar manualmente o pedido.');
        return res.redirect('back');
    }
});

router.post('/pedidos/:id/cancelar', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findByPk(id);
        if (!order) {
            req.flash('error', 'Pedido não encontrado.');
            return res.redirect('back');
        }

        order.status = 'cancelled';
        await order.save();

        req.flash('success', 'Pedido cancelado com sucesso.');
        return res.redirect('back');
    } catch (error) {
        console.error('Erro ao cancelar pedido:', error);
        req.flash('error', 'Erro ao cancelar pedido.');
        return res.redirect('back');
    }
});

// === Clients & Campaigns Routes ===
router.get('/clientes-campanhas', requireAdmin, async (req, res) => {
    try {
        const editUserId = req.query.edit || null;

        const [users, orders] = await Promise.all([
            User.findAll({ order: [['createdAt', 'DESC']] }),
            Order.findAll({ order: [['createdAt', 'DESC']] })
        ]);

        const usersPlain = users.map(u => u.get({ plain: true }));

        const ordersPlain = orders.map(order => {
            const plain = order.get({ plain: true });
            try {
                if (typeof plain.items === 'string') {
                    plain.items = JSON.parse(plain.items);
                    if (typeof plain.items === 'string') {
                        plain.items = JSON.parse(plain.items);
                    }
                }
                if (!Array.isArray(plain.items)) {
                    plain.items = [];
                }
            } catch (e) {
                console.error(`Erro ao parsear itens do pedido ${plain.id}:`, e);
                plain.items = [];
            }
            return plain;
        });

        const ordersByUser = {};
        ordersPlain.forEach(order => {
            if (!order.userId) return;
            if (!ordersByUser[order.userId]) {
                ordersByUser[order.userId] = [];
            }
            ordersByUser[order.userId].push(order);
        });

        const shirtIdSet = new Set();
        Object.values(ordersByUser).forEach(userOrders => {
            userOrders.forEach(order => {
                if (Array.isArray(order.items)) {
                    order.items.forEach(item => {
                        if (item && item.id) {
                            shirtIdSet.add(item.id);
                        }
                    });
                }
            });
        });

        let shirtsById = {};
        if (shirtIdSet.size > 0) {
            const shirts = await Shirt.findAll({
                where: { id: Array.from(shirtIdSet) },
                include: [{ model: Campaign }]
            });
            shirtsById = shirts.reduce((acc, shirt) => {
                const plain = shirt.get({ plain: true });
                acc[plain.id] = plain;
                return acc;
            }, {});
        }

        const usersWithStats = usersPlain.map(user => {
            const userOrders = ordersByUser[user.id] || [];
            const campaignsMap = {};
            let totalOrders = 0;
            let totalSpent = 0;
            let lastOrderDate = null;

            userOrders.forEach(order => {
                totalOrders += 1;
                const orderTotal = parseFloat(order.finalAmount) || 0;
                totalSpent += orderTotal;

                let campaign = null;
                if (Array.isArray(order.items) && order.items.length > 0) {
                    const firstItem = order.items[0];
                    const shirt = shirtsById[firstItem.id];
                    if (shirt && shirt.Campaign) {
                        campaign = shirt.Campaign;
                    }
                }

                if (campaign) {
                    const key = campaign.id;
                    if (!campaignsMap[key]) {
                        campaignsMap[key] = {
                            id: campaign.id,
                            title: campaign.title,
                            accessCode: campaign.accessCode,
                            status: campaign.status,
                            totalOrders: 0,
                            totalItems: 0,
                            totalSpent: 0,
                            lastOrderDate: null
                        };
                    }

                    const stats = campaignsMap[key];
                    stats.totalOrders += 1;

                    let itemsQty = 0;
                    if (Array.isArray(order.items)) {
                        order.items.forEach(it => {
                            itemsQty += it.qty || 0;
                        });
                    }
                    stats.totalItems += itemsQty;
                    stats.totalSpent += orderTotal;

                    const orderDate = order.createdAt;
                    if (orderDate) {
                        const current = stats.lastOrderDate ? new Date(stats.lastOrderDate) : null;
                        const candidate = new Date(orderDate);
                        if (!current || candidate > current) {
                            stats.lastOrderDate = orderDate;
                        }

                        const userCurrent = lastOrderDate ? new Date(lastOrderDate) : null;
                        if (!userCurrent || candidate > userCurrent) {
                            lastOrderDate = orderDate;
                        }
                    }
                }
            });

            return {
                ...user,
                totalOrders,
                totalSpent,
                campaigns: Object.values(campaignsMap),
                lastOrderDate
            };
        });

        let editUser = null;
        if (editUserId) {
            editUser = usersWithStats.find(u => String(u.id) === String(editUserId)) || null;
        }

        res.render('admin/client-campaigns', {
            title: 'Clientes e Campanhas',
            layout: 'main',
            isClients: true,
            users: usersWithStats,
            editUser
        });
    } catch (error) {
        console.error('Erro ao carregar clientes e campanhas:', error);
        res.render('admin/client-campaigns', {
            title: 'Clientes e Campanhas',
            layout: 'main',
            isClients: true,
            users: [],
            error: 'Erro ao carregar clientes e campanhas.'
        });
    }
});

router.post('/clientes-campanhas/editar/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, email, phone } = req.body;

    try {
        const user = await User.findByPk(id);
        if (!user) {
            req.flash('error', 'Cliente não encontrado.');
            return res.redirect('/admin/clientes-campanhas');
        }

        user.name = name || user.name;
        user.email = email || user.email;
        user.phone = phone || user.phone;

        await user.save();

        req.flash('success', 'Cliente atualizado com sucesso.');
        res.redirect('/admin/clientes-campanhas');
    } catch (error) {
        console.error('Erro ao atualizar cliente:', error);
        req.flash('error', 'Erro ao atualizar cliente.');
        res.redirect(`/admin/clientes-campanhas?edit=${id}`);
    }
});

router.post('/clientes-campanhas/deletar/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;

    try {
        const user = await User.findByPk(id);
        if (!user) {
            req.flash('error', 'Cliente não encontrado.');
            return res.redirect('/admin/clientes-campanhas');
        }

        await user.destroy();

        req.flash('success', 'Cliente removido com sucesso.');
        res.redirect('/admin/clientes-campanhas');
    } catch (error) {
        console.error('Erro ao remover cliente:', error);
        req.flash('error', 'Erro ao remover cliente.');
        res.redirect('/admin/clientes-campanhas');
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

// === Coupon Routes ===
router.get('/cupons', requireAdmin, async (req, res) => {
    try {
        const coupons = await Coupon.findAll({ order: [['createdAt', 'DESC']] });
        res.render('admin/coupons', {
            title: 'Gerenciar Cupons',
            layout: 'main',
            isCoupons: true,
            coupons: coupons.map(c => c.get({ plain: true }))
        });
    } catch (error) {
        console.error(error);
        res.render('admin/coupons', {
            title: 'Gerenciar Cupons',
            layout: 'main',
            isCoupons: true,
            error: 'Erro ao carregar cupons.'
        });
    }
});

router.get('/cupons/novo', requireAdmin, (req, res) => {
    res.render('admin/coupon-form', {
        title: 'Novo Cupom',
        layout: 'main',
        isCoupons: true
    });
});

router.post('/cupons/novo', requireAdmin, async (req, res) => {
    try {
        console.log('Recebendo dados para novo cupom:', req.body);
        const { code, discountType, discountValue, status } = req.body;
        
        if (!code || !discountType || !discountValue) {
            return res.render('admin/coupon-form', {
                title: 'Novo Cupom',
                layout: 'main',
                isCoupons: true,
                error: 'Preencha todos os campos obrigatórios.',
                coupon: req.body
            });
        }

        const existingCoupon = await Coupon.findOne({ where: { code: code.toUpperCase() } });
        if (existingCoupon) {
            return res.render('admin/coupon-form', {
                title: 'Novo Cupom',
                layout: 'main',
                isCoupons: true,
                error: 'Já existe um cupom com este código.',
                coupon: req.body
            });
        }

        await Coupon.create({
            code,
            discountType,
            discountValue: parseFloat(discountValue), // Ensure it's a number
            status: status || 'active'
        });

        req.flash('success', 'Cupom criado com sucesso!');
        res.redirect('/admin/cupons');
    } catch (error) {
        console.error('Erro ao criar cupom:', error);
        res.render('admin/coupon-form', {
            title: 'Novo Cupom',
            layout: 'main',
            isCoupons: true,
            error: 'Erro ao criar cupom: ' + error.message,
            coupon: req.body
        });
    }
});

router.get('/cupons/editar/:id', requireAdmin, async (req, res) => {
    try {
        const coupon = await Coupon.findByPk(req.params.id);
        if (!coupon) return res.redirect('/admin/cupons');

        res.render('admin/coupon-form', {
            title: 'Editar Cupom',
            layout: 'main',
            isCoupons: true,
            coupon: coupon.get({ plain: true })
        });
    } catch (error) {
        console.error(error);
        res.redirect('/admin/cupons');
    }
});

router.post('/cupons/editar/:id', requireAdmin, async (req, res) => {
    try {
        const { code, discountType, discountValue, status } = req.body;
        const coupon = await Coupon.findByPk(req.params.id);
        
        if (!coupon) return res.redirect('/admin/cupons');

        if (!code || !discountType || !discountValue) {
             return res.render('admin/coupon-form', {
                title: 'Editar Cupom',
                layout: 'main',
                isCoupons: true,
                error: 'Preencha todos os campos obrigatórios.',
                coupon: { id: req.params.id, ...req.body }
            });
        }

        // Check unique code if changed
        if (code.toUpperCase() !== coupon.code) {
             const existingCoupon = await Coupon.findOne({ where: { code: code.toUpperCase() } });
             if (existingCoupon) {
                return res.render('admin/coupon-form', {
                    title: 'Editar Cupom',
                    layout: 'main',
                    isCoupons: true,
                    error: 'Já existe um cupom com este código.',
                    coupon: { id: req.params.id, ...req.body }
                });
             }
        }

        await coupon.update({
            code,
            discountType,
            discountValue: parseFloat(discountValue),
            status: status || 'active'
        });

        req.flash('success', 'Cupom atualizado com sucesso!');
        res.redirect('/admin/cupons');
    } catch (error) {
        console.error('Erro ao atualizar cupom:', error);
        res.render('admin/coupon-form', {
            title: 'Editar Cupom',
            layout: 'main',
            isCoupons: true,
            error: 'Erro ao atualizar cupom: ' + error.message,
            coupon: { id: req.params.id, ...req.body }
        });
    }
});

router.post('/cupons/toggle-status/:id', requireAdmin, async (req, res) => {
    try {
        const coupon = await Coupon.findByPk(req.params.id);
        if (!coupon) return res.status(404).json({ success: false });

        const newStatus = coupon.status === 'active' ? 'inactive' : 'active';
        await coupon.update({ status: newStatus });
        
        res.json({ success: true, newStatus });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false });
    }
});

router.post('/cupons/deletar/:id', requireAdmin, async (req, res) => {
    try {
        await Coupon.destroy({ where: { id: req.params.id } });
        req.flash('success', 'Cupom excluído com sucesso.');
        res.redirect('/admin/cupons');
    } catch (error) {
        console.error(error);
        res.redirect('/admin/cupons');
    }
});

// === Admin Management (Super Admin only) ===
router.get('/usuarios', requireSuperAdmin, async (req, res) => {
    try {
        const admins = await Admin.findAll({ order: [['createdAt', 'DESC']] });
        const adminsPlain = admins.map(a => a.get({ plain: true }));

        res.render('admin/admin-users', {
            title: 'Administradores',
            layout: 'main',
            isAdmins: true,
            admins: adminsPlain,
            admin: req.session.admin
        });
    } catch (error) {
        console.error(error);
        res.render('admin/admin-users', {
            title: 'Administradores',
            layout: 'main',
            isAdmins: true,
            admins: [],
            error: 'Erro ao carregar administradores.',
            admin: req.session.admin
        });
    }
});

router.get('/usuarios/novo', requireSuperAdmin, (req, res) => {
    res.render('admin/admin-user-form', {
        title: 'Novo Administrador',
        layout: 'main',
        isAdmins: true,
        admin: req.session.admin
    });
});

router.post('/usuarios/novo', requireSuperAdmin, async (req, res) => {
    const { username, email, password, confirmPassword, role } = req.body;

    try {
        if (!username || !email || !password) {
            return res.render('admin/admin-user-form', {
                title: 'Novo Administrador',
                layout: 'main',
                isAdmins: true,
                error: 'Preencha todos os campos obrigatórios.',
                formData: { username, email, role },
                admin: req.session.admin
            });
        }

        if (password !== confirmPassword) {
            return res.render('admin/admin-user-form', {
                title: 'Novo Administrador',
                layout: 'main',
                isAdmins: true,
                error: 'As senhas não coincidem.',
                formData: { username, email, role },
                admin: req.session.admin
            });
        }

        const existing = await Admin.findOne({ where: { email } });
        if (existing) {
            return res.render('admin/admin-user-form', {
                title: 'Novo Administrador',
                layout: 'main',
                isAdmins: true,
                error: 'Já existe um administrador com este e-mail.',
                formData: { username, email, role },
                admin: req.session.admin
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await Admin.create({
            username,
            email,
            password: hashedPassword,
            role: role && role === 'superadmin' ? 'superadmin' : 'admin'
        });

        req.flash('success', 'Administrador criado com sucesso.');
        res.redirect('/admin/usuarios');
    } catch (error) {
        console.error(error);
        res.render('admin/admin-user-form', {
            title: 'Novo Administrador',
            layout: 'main',
            isAdmins: true,
            error: 'Erro ao criar administrador.',
            formData: { username, email, role },
            admin: req.session.admin
        });
    }
});

router.get('/usuarios/editar/:id', requireSuperAdmin, async (req, res) => {
    try {
        const adminRecord = await Admin.findByPk(req.params.id);
        if (!adminRecord) {
            return res.redirect('/admin/usuarios');
        }

        res.render('admin/admin-user-form', {
            title: 'Editar Administrador',
            layout: 'main',
            isAdmins: true,
            editMode: true,
            adminToEdit: adminRecord.get({ plain: true }),
            admin: req.session.admin
        });
    } catch (error) {
        console.error(error);
        res.redirect('/admin/usuarios');
    }
});

router.post('/usuarios/editar/:id', requireSuperAdmin, async (req, res) => {
    const { username, email, password, confirmPassword, role } = req.body;
    const id = req.params.id;

    try {
        const adminRecord = await Admin.findByPk(id);
        if (!adminRecord) {
            return res.redirect('/admin/usuarios');
        }

        adminRecord.username = username || adminRecord.username;
        adminRecord.email = email || adminRecord.email;

        if (role) {
            adminRecord.role = role === 'superadmin' ? 'superadmin' : 'admin';
        }

        if (password) {
            if (password !== confirmPassword) {
                return res.render('admin/admin-user-form', {
                    title: 'Editar Administrador',
                    layout: 'main',
                    isAdmins: true,
                    editMode: true,
                    adminToEdit: adminRecord.get({ plain: true }),
                    error: 'As senhas não coincidem.',
                    admin: req.session.admin
                });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            adminRecord.password = hashedPassword;
        }

        await adminRecord.save();

        req.flash('success', 'Administrador atualizado com sucesso.');
        res.redirect('/admin/usuarios');
    } catch (error) {
        console.error(error);
        res.render('admin/admin-user-form', {
            title: 'Editar Administrador',
            layout: 'main',
            isAdmins: true,
            editMode: true,
            adminToEdit: { id, username, email, role },
            error: 'Erro ao atualizar administrador.',
            admin: req.session.admin
        });
    }
});

router.post('/usuarios/deletar/:id', requireSuperAdmin, async (req, res) => {
    const id = req.params.id;

    try {
        const adminRecord = await Admin.findByPk(id);
        if (!adminRecord) {
            return res.redirect('/admin/usuarios');
        }

        if (req.session.admin && req.session.admin.id === adminRecord.id) {
            req.flash('error', 'Você não pode remover a si mesmo.');
            return res.redirect('/admin/usuarios');
        }

        if (adminRecord.role === 'superadmin') {
            const superCount = await Admin.count({ where: { role: 'superadmin' } });
            if (superCount <= 1) {
                req.flash('error', 'É necessário ter pelo menos um super admin.');
                return res.redirect('/admin/usuarios');
            }
        }

        await adminRecord.destroy();
        req.flash('success', 'Administrador removido com sucesso.');
        res.redirect('/admin/usuarios');
    } catch (error) {
        console.error(error);
        req.flash('error', 'Erro ao remover administrador.');
        res.redirect('/admin/usuarios');
    }
});

module.exports = router;
