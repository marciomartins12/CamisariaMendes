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

const getFeePercentByPaymentMethod = (paymentMethod) => {
    if (!paymentMethod) return 0;
    const m = String(paymentMethod).toLowerCase();
    if (m === 'pix' || m === 'bank_transfer') return 0.0099;
    if (m === 'credit_card' || m === 'debit_card' || m === 'prepaid_card') return 0.0499;
    return 0.0499;
};

// Middleware to require login
const requireAdmin = (req, res, next) => {
    if (req.session && req.session.admin) {
        return next();
    }
    return res.redirect('/auth/login');
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
    res.redirect('/auth/login');
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
    res.redirect('/auth/login');
});

// Dashboard
router.get('/dashboard', requireAdmin, async (req, res) => {
    try {
        const [activeCampaignCount, approvedOrders] = await Promise.all([
            Campaign.count({ where: { status: 'active' } }),
            Order.findAll({
                where: { status: 'approved' },
                attributes: [
                    'id',
                    'finalAmount',
                    'items',
                    'customerName',
                    'customerEmail',
                    'customerPhone',
                    'paymentMethod',
                    'createdAt',
                    'userId'
                ]
            })
        ]);

        let totalRevenue = 0;
        let totalNetRevenue = 0;
        const shirtIdSet = new Set();
        const customerStats = {};

        const normalizedOrders = approvedOrders.map(order => {
            const plain = order.get({ plain: true });
            let items = plain.items;

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

            if (!Array.isArray(items)) {
                items = [];
            }

            const itemIds = [];
            items.forEach(it => {
                const pid = it && (it.id ?? it.productId ?? it.shirtId);
                const num = Number(pid);
                if (Number.isFinite(num)) {
                    itemIds.push(num);
                    shirtIdSet.add(num);
                }
            });

            const val = parseFloat(plain.finalAmount) || 0;
            const feePercent = getFeePercentByPaymentMethod(plain.paymentMethod);
            const net = val * (1 - feePercent);

            totalRevenue += val;
            totalNetRevenue += net;

            let customerKey = '';
            if (plain.userId) {
                customerKey = `user:${plain.userId}`;
            } else if (plain.customerEmail) {
                customerKey = `email:${String(plain.customerEmail).toLowerCase()}`;
            } else if (plain.customerName) {
                customerKey = `name:${String(plain.customerName).toLowerCase()}`;
            }

            if (customerKey) {
                if (!customerStats[customerKey]) {
                    customerStats[customerKey] = {
                        userId: plain.userId || null,
                        name: plain.customerName || 'Cliente',
                        email: plain.customerEmail || '',
                        totalOrders: 0,
                        totalSpent: 0,
                        totalNetSpent: 0
                    };
                }
                const cs = customerStats[customerKey];
                cs.totalOrders += 1;
                cs.totalSpent += val;
                cs.totalNetSpent += net;
            }

            let finalAmountFormatted = `${val.toFixed(2)}`;
            let netAmountFormatted = `${net.toFixed(2)}`;
            try {
                finalAmountFormatted = val.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            } catch (e) {}
            try {
                netAmountFormatted = net.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            } catch (e) {}

            let paymentMethodLabel = '';
            if (plain.paymentMethod) {
                const m = String(plain.paymentMethod).toLowerCase();
                if (m === 'pix') paymentMethodLabel = 'Pix';
                else if (m === 'bank_transfer') paymentMethodLabel = 'Transferência';
                else if (m === 'credit_card') paymentMethodLabel = 'Cartão de Crédito';
                else if (m === 'debit_card') paymentMethodLabel = 'Cartão de Débito';
                else if (m === 'prepaid_card') paymentMethodLabel = 'Cartão Pré-pago';
                else paymentMethodLabel = plain.paymentMethod;
            }

            return {
                id: plain.id,
                finalAmount: val,
                finalAmountFormatted,
                netAmount: net,
                netAmountFormatted,
                customerName: plain.customerName || 'Cliente',
                customerEmail: plain.customerEmail || '',
                customerPhone: plain.customerPhone || '',
                paymentMethod: plain.paymentMethod,
                paymentMethodLabel,
                createdAt: plain.createdAt,
                userId: plain.userId || null,
                items,
                itemIds,
                campaignId: null,
                campaignTitle: null,
                campaignAccessCode: null
            };
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

        const campaignStats = {};
        normalizedOrders.forEach(o => {
            let campaign = null;
            if (Array.isArray(o.items) && o.items.length > 0) {
                for (const it of o.items) {
                    const pid = it && (it.id ?? it.productId ?? it.shirtId);
                    const num = Number(pid);
                    if (Number.isFinite(num) && shirtsById[num] && shirtsById[num].Campaign) {
                        campaign = shirtsById[num].Campaign;
                        break;
                    }
                }
            }

            if (campaign) {
                o.campaignId = campaign.id;
                o.campaignTitle = campaign.title;
                o.campaignAccessCode = campaign.accessCode;

                const key = campaign.id;
                if (!campaignStats[key]) {
                    campaignStats[key] = {
                        id: campaign.id,
                        title: campaign.title,
                        accessCode: campaign.accessCode,
                        totalOrders: 0,
                        totalRevenue: 0,
                        totalNetRevenue: 0
                    };
                }
                const cs = campaignStats[key];
                cs.totalOrders += 1;
                cs.totalRevenue += o.finalAmount;
                cs.totalNetRevenue += o.netAmount;
            }
        });

        const totalApprovedOrders = normalizedOrders.length;
        let totalRevenueFormatted = `${totalRevenue.toFixed(2)}`;
        let totalNetRevenueFormatted = `${totalNetRevenue.toFixed(2)}`;
        try {
            totalRevenueFormatted = totalRevenue.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } catch (e) {}
        try {
            totalNetRevenueFormatted = totalNetRevenue.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } catch (e) {}

        const uniqueCustomers = Object.keys(customerStats).length;
        const averageTicket = totalApprovedOrders > 0 ? totalNetRevenue / totalApprovedOrders : 0;
        let averageTicketFormatted = `${averageTicket.toFixed(2)}`;
        try {
            averageTicketFormatted = averageTicket.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } catch (e) {}

        let topCustomer = null;
        Object.values(customerStats).forEach(cs => {
            if (!topCustomer || cs.totalNetSpent > topCustomer.totalNetSpent) {
                topCustomer = cs;
            }
        });

        if (topCustomer) {
            let totalSpentFormatted = `${topCustomer.totalSpent.toFixed(2)}`;
            let totalNetSpentFormatted = `${topCustomer.totalNetSpent.toFixed(2)}`;
            try {
                totalSpentFormatted = topCustomer.totalSpent.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            } catch (e) {}
            try {
                totalNetSpentFormatted = topCustomer.totalNetSpent.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            } catch (e) {}
            topCustomer = {
                ...topCustomer,
                totalSpentFormatted,
                totalNetSpentFormatted
            };
        }

        let topCampaign = null;
        Object.values(campaignStats).forEach(cs => {
            if (!topCampaign || cs.totalOrders > topCampaign.totalOrders) {
                topCampaign = cs;
            }
        });

        if (topCampaign) {
            let campaignRevenueFormatted = `${topCampaign.totalRevenue.toFixed(2)}`;
            let campaignNetRevenueFormatted = `${topCampaign.totalNetRevenue.toFixed(2)}`;
            try {
                campaignRevenueFormatted = topCampaign.totalRevenue.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            } catch (e) {}
            try {
                campaignNetRevenueFormatted = topCampaign.totalNetRevenue.toLocaleString('pt-BR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });
            } catch (e) {}
            topCampaign = {
                ...topCampaign,
                totalRevenueFormatted: campaignRevenueFormatted,
                totalNetRevenueFormatted: campaignNetRevenueFormatted
            };
        }

        const latestOrders = normalizedOrders
            .slice()
            .sort((a, b) => {
                const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return db - da;
            })
            .slice(0, 8);

        res.render('admin/dashboard', {
            title: 'Dashboard - Camisaria Mendes',
            layout: 'main',
            isDashboard: true,
            summary: {
                activeCampaignCount,
                totalApprovedOrders,
                totalRevenue,
                totalRevenueFormatted,
                totalNetRevenue,
                totalNetRevenueFormatted,
                uniqueCustomers,
                averageTicket,
                averageTicketFormatted
            },
            latestOrders,
            topCustomer,
            topCampaign
        });
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        res.render('admin/dashboard', {
            title: 'Dashboard - Camisaria Mendes',
            layout: 'main',
            isDashboard: true,
            summary: {
                activeCampaignCount: 0,
                totalApprovedOrders: 0,
                totalRevenue: 0,
                totalRevenueFormatted: '0,00',
                totalNetRevenue: 0,
                totalNetRevenueFormatted: '0,00',
                uniqueCustomers: 0,
                averageTicket: 0,
                averageTicketFormatted: '0,00'
            },
            latestOrders: [],
            topCustomer: null,
            topCampaign: null
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
            plain.formattedId = `CAMP${String(plain.id).padStart(3, '0')}`;
            plain.totalRevenue = 0;
            plain.totalOrders = 0;
            return plain;
        });

        if (statusUpdates.length) {
            await Promise.all(statusUpdates);
        }

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
                    'paymentMethod',
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
                let netRevenueSum = 0;
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
                        const feePercent = getFeePercentByPaymentMethod(o.paymentMethod);
                        const net = val * (1 - feePercent);
                        netRevenueSum += net;
                    }
                });
                cp.totalOrders = ordersCount;
                cp.totalRevenue = revenueSum;
                cp.totalNetRevenue = netRevenueSum;
                try {
                    cp.totalRevenueFormatted = revenueSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } catch (e) {
                    cp.totalRevenueFormatted = `${revenueSum.toFixed(2)}`;
                }
                try {
                    cp.totalNetRevenueFormatted = netRevenueSum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } catch (e) {
                    cp.totalNetRevenueFormatted = `${netRevenueSum.toFixed(2)}`;
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

        campaignPlain.formattedId = `CAMP${String(campaignPlain.id).padStart(3, '0')}`;

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

        let ordersForCampaign = [];
        let totalOrders = 0;
        let totalRevenue = 0;
        let totalNetRevenue = 0;

        if (shirtIds.length > 0) {
            try {
                const allOrders = await Order.findAll({
                    where: { status: 'approved' },
                    attributes: ['id', 'status', 'finalAmount', 'items', 'customerName', 'customerEmail', 'customerPhone', 'paymentMethod', 'createdAt', 'userId'],
                    include: [{ model: User, attributes: ['phone', 'name'] }]
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
                        let customerPhone = plain.customerPhone || '';
                        if (!customerPhone && plain.User && plain.User.phone) {
                            customerPhone = plain.User.phone;
                        }

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
                    const feePercent = getFeePercentByPaymentMethod(o.paymentMethod);
                    const net = val * (1 - feePercent);
                    totalNetRevenue += net;
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
        campaignPlain.totalNetRevenue = totalNetRevenue;
        try {
            campaignPlain.totalRevenueFormatted = totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } catch (e) {
            campaignPlain.totalRevenueFormatted = `${totalRevenue.toFixed(2)}`;
        }
        try {
            campaignPlain.totalNetRevenueFormatted = totalNetRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } catch (e) {
            campaignPlain.totalNetRevenueFormatted = `${totalNetRevenue.toFixed(2)}`;
        }
        try {
            campaignPlain.totalRevenueFormatted = totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        } catch (e) {
            campaignPlain.totalRevenueFormatted = `${totalRevenue.toFixed(2)}`;
        }

        // Calculate Sales Summary for View
        const salesSummary = {}; // { 'Shirt Name': { total: 0, sizes: {}, type: 'Tradicional', image: null } }
        
        ordersForCampaign.forEach(order => {
            const items = order.items || [];
            items.forEach(item => {
                const pid = Number(item.id || item.productId || item.shirtId);
                const name = (item.name || '').trim();
                
                // Check if this item belongs to campaign
                if (shirtIds.includes(pid) || shirtNames.includes(name)) {
                    const key = name || `Produto #${pid}`;
                    if (!salesSummary[key]) {
                        // Try to find image/type from campaign shirts
                        let productImg = null;
                        let productType = item.type || 'Padrão';
                        
                        const matchingShirt = (campaignPlain.shirts || []).find(s => Number(s.id) === pid || s.name === name);
                        if (matchingShirt) {
                            productType = matchingShirt.type;
                            try {
                                const imgs = matchingShirt.images || []; // already parsed above
                                if (imgs.length > 0) productImg = imgs[0];
                            } catch(e) {}
                        }
                        
                        salesSummary[key] = { 
                            total: 0, 
                            sizes: {}, 
                            type: productType,
                            image: productImg
                        };
                    }
                    
                    const qty = Number(item.qty || item.quantity || 1);
                    salesSummary[key].total += qty;
                    
                    const size = item.size || 'N/A';
                    if (!salesSummary[key].sizes[size]) salesSummary[key].sizes[size] = 0;
                    salesSummary[key].sizes[size] += qty;
                }
            });
        });

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
            orders: ordersForCampaign,
            salesSummary
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

// Export Orders (Word)
router.get('/campanhas/:id/exportar-word', requireAdmin, async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle, Header, Footer, ImageRun } = require('docx');
        
        const campaign = await Campaign.findByPk(req.params.id, {
            include: [{ model: Shirt, as: 'shirts' }]
        });
        
        if (!campaign) return res.status(404).send('Campanha não encontrada');

        const formattedId = `CAMP${String(campaign.id).padStart(3, '0')}`;

        const shirtIds = (campaign.shirts || []).map(s => Number(s.id));
        const shirtNames = (campaign.shirts || []).map(s => (s.name || '').trim());
        
        // Fetch all approved orders
        const allOrders = await Order.findAll({
            where: { status: 'approved' },
            attributes: ['id', 'status', 'finalAmount', 'items', 'customerName', 'customerEmail', 'customerPhone', 'createdAt', 'paymentMethod', 'userId'],
            include: [{ model: User, attributes: ['phone', 'name'] }] 
        });
        
        // Filter orders for this campaign
        const campaignOrders = allOrders.filter(order => {
            const plain = order.get({ plain: true });
            let items = plain.items;
            try {
                if (typeof items === 'string') items = JSON.parse(items);
                if (typeof items === 'string') items = JSON.parse(items);
            } catch(e) { items = []; }
            if (!Array.isArray(items)) items = [];
            
            // Attach parsed items to order object for later use
            order.parsedItems = items;
            
            return items.some(it => {
                const pid = Number(it.id || it.productId || it.shirtId);
                return shirtIds.includes(pid) || shirtNames.includes((it.name || '').trim());
            });
        });
        
        // Aggregate data for summary
        const summary = {}; // { 'Shirt Name': { total: 0, sizes: { 'M': 2, 'L': 1 }, type: 'Tradicional', image: 'url' } }
        
        campaignOrders.forEach(order => {
            order.parsedItems.forEach(item => {
                const pid = Number(item.id || item.productId || item.shirtId);
                const name = (item.name || '').trim();
                
                // Check if this item belongs to campaign
                if (shirtIds.includes(pid) || shirtNames.includes(name)) {
                    const key = name || `Produto #${pid}`;
                    if (!summary[key]) {
                        // Try to find image/type from campaign shirts
                        let productImg = null;
                        let productType = item.type || 'Padrão';

                        const matchingShirt = (campaign.shirts || []).find(s => s.id === pid || s.name === name);
                        if (matchingShirt) {
                            productType = matchingShirt.type;
                            try {
                                const imgs = JSON.parse(matchingShirt.imagesJSON || '[]');
                                if (imgs.length > 0) productImg = imgs[0];
                            } catch(e) {}
                        }
                        
                        summary[key] = { 
                            total: 0, 
                            sizes: {}, 
                            type: productType,
                            image: productImg
                        };
                    }
                    
                    const qty = Number(item.qty || item.quantity || 1);
                    summary[key].total += qty;
                    
                    const size = item.size || 'N/A';
                    if (!summary[key].sizes[size]) summary[key].sizes[size] = 0;
                    summary[key].sizes[size] += qty;
                }
            });
        });
        
        // Helper to load image
        const getImageBuffer = (imagePath) => {
            try {
                // If it's a URL or uploaded path, try to resolve it
                // Assuming local uploads for now. If external URL, would need fetch.
                // Checking for local file in public/uploads or public/images
                
                let localPath = null;
                if (imagePath.startsWith('/')) {
                    localPath = path.join(__dirname, '../public', imagePath);
                } else {
                    localPath = path.join(__dirname, '../public/images', imagePath);
                }
                
                if (fs.existsSync(localPath)) {
                    return fs.readFileSync(localPath);
                }
                return null;
            } catch (e) {
                return null;
            }
        };

        // Create Document with better styling
        const children = [];
        
        // 1. HEADER SECTION
        
        // Header Table with Title
        const headerTableRows = [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({ 
                                        text: "CAMISARIA MENDES", 
                                        bold: true, 
                                        size: 28,
                                        color: "1F4E79"
                                    })
                                ],
                                alignment: AlignmentType.CENTER
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({ 
                                        text: "RELATÓRIO DE PEDIDOS", 
                                        bold: true, 
                                        size: 24,
                                        color: "555555"
                                    })
                                ],
                                alignment: AlignmentType.CENTER,
                                spacing: { before: 50 }
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({ 
                                        text: `Gerado por: ${req.session.user ? req.session.user.name : 'Administrador'} em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`,
                                        size: 16,
                                        color: "777777",
                                        italics: true
                                    })
                                ],
                                alignment: AlignmentType.CENTER,
                                spacing: { before: 50 }
                            })
                        ],
                        verticalAlign: AlignmentType.CENTER,
                        borders: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "1F4E79" } }
                    })
                ]
            })
        ];

        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: headerTableRows,
                borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.NONE },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                    insideVertical: { style: BorderStyle.NONE }
                }
            }),
            new Paragraph({ text: "", spacing: { after: 300 } })
        );

        // Campaign Info Table (2 columns: Details | Stats)

        // Campaign Info Table (2 columns: Details | Stats)
        const campaignDate = new Date(campaign.createdAt).toLocaleDateString('pt-BR');
        const totalRevenue = campaignOrders.reduce((sum, order) => sum + Number(order.finalAmount || 0), 0);
        const totalItems = campaignOrders.reduce((sum, order) => {
            const items = order.parsedItems || [];
            return sum + items.reduce((s, i) => s + (Number(i.qty) || 1), 0);
        }, 0);

        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                borders: {
                    top: { style: BorderStyle.NONE },
                    bottom: { style: BorderStyle.SINGLE, size: 6, color: "E0E0E0" },
                    left: { style: BorderStyle.NONE },
                    right: { style: BorderStyle.NONE },
                    insideVertical: { style: BorderStyle.NONE },
                },
                rows: [
                    new TableRow({
                        children: [
                            new TableCell({
                                width: { size: 60, type: WidthType.PERCENTAGE },
                                children: [
                                    new Paragraph({ 
                                        children: [new TextRun({ text: "CAMPANHA:", bold: true, size: 24 })],
                                        spacing: { before: 100 }
                                    }),
                                    new Paragraph({ text: campaign.title, spacing: { after: 100 } }),
                                    new Paragraph({ 
                                        children: [new TextRun({ text: "N° da campanha: ", bold: true }), new TextRun({ text: formattedId, color: "2E74B5", bold: true })] 
                                    }),
                                    new Paragraph({ 
                                        children: [new TextRun({ text: "Líder da campanha: ", bold: true }), new TextRun(campaign.clientName)] 
                                    }),
                                    new Paragraph({ 
                                        children: [new TextRun({ text: "Telefone: ", bold: true }), new TextRun(campaign.clientPhone || "Não informado")] 
                                    }),
                                    new Paragraph({ 
                                        children: [new TextRun({ text: "Instagram: ", bold: true }), new TextRun(campaign.clientInstagram ? `@${campaign.clientInstagram.replace('@', '')}` : "Não informado")] 
                                    }),
                                    new Paragraph({ 
                                        children: [new TextRun({ text: "Código: ", bold: true }), new TextRun(campaign.accessCode)] 
                                    }),
                                ]
                            }),
                            new TableCell({
                                width: { size: 40, type: WidthType.PERCENTAGE },
                                children: [
                                    new Paragraph({ 
                                        children: [new TextRun({ text: "RESUMO:", bold: true, size: 24 })],
                                        alignment: AlignmentType.RIGHT,
                                        spacing: { before: 100 }
                                    }),
                                    new Paragraph({ 
                                        children: [new TextRun({ text: "Total de Pedidos: ", bold: true }), new TextRun(String(campaignOrders.length))],
                                        alignment: AlignmentType.RIGHT
                                    }),
                                    new Paragraph({ 
                                        children: [new TextRun({ text: "Itens Vendidos: ", bold: true }), new TextRun(String(totalItems))],
                                        alignment: AlignmentType.RIGHT
                                    }),
                                    new Paragraph({ 
                                        children: [new TextRun({ text: "Faturamento: ", bold: true }), new TextRun(`R$ ${totalRevenue.toFixed(2).replace('.', ',')}`)],
                                        alignment: AlignmentType.RIGHT,
                                        spacing: { after: 100 }
                                    }),
                                ]
                            })
                        ]
                    })
                ]
            }),
            new Paragraph({ text: "", spacing: { after: 400 } }) // Spacer
        );

        // 2. PRODUCT SUMMARY SECTION
        children.push(
            new Paragraph({
                text: "RESUMO POR PRODUTO",
                heading: HeadingLevel.HEADING_2,
                spacing: { after: 200 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } }
            })
        );

        // One unified table for all products? Or separate tables? 
        // Let's do separate tables per product for clarity, as requested "bem mais dividido".
        
        Object.entries(summary).forEach(([name, data]) => {
            // Sort sizes
            const sortedSizes = Object.entries(data.sizes).sort((a, b) => {
                const order = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG', 'EXG', 'Infantil'];
                const idxA = order.indexOf(a[0]);
                const idxB = order.indexOf(b[0]);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                return a[0].localeCompare(b[0]);
            });

            // Product Header
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: "• " + name, bold: true, size: 24, color: "333333" }),
                        new TextRun({ text: ` (${data.type})`, italics: true, color: "666666" })
                    ],
                    spacing: { before: 200, after: 100 }
                })
            );

            // Table with 2 columns: Image (Left) | Sizes Table (Right)
            // If image exists, we split. If not, just sizes table.
            
            let productImageRun = null;
            if (data.image) {
                const imgBuffer = getImageBuffer(data.image);
                if (imgBuffer) {
                    try {
                        productImageRun = new ImageRun({
                            data: imgBuffer,
                            transformation: { width: 150, height: 150 }
                        });
                    } catch(e) {}
                }
            }

            // Sizes Table Logic
            const tableHeaderColor = "F2F2F2";
            const sizeTableRows = [
                new TableRow({
                    children: [
                        new TableCell({ 
                            children: [new Paragraph({ text: "TAMANHO", bold: true, alignment: AlignmentType.CENTER })],
                            shading: { fill: tableHeaderColor },
                            width: { size: 50, type: WidthType.PERCENTAGE }
                        }),
                        new TableCell({ 
                            children: [new Paragraph({ text: "QUANTIDADE", bold: true, alignment: AlignmentType.CENTER })],
                            shading: { fill: tableHeaderColor },
                            width: { size: 50, type: WidthType.PERCENTAGE }
                        })
                    ]
                })
            ];

            sortedSizes.forEach(([size, qty]) => {
                sizeTableRows.push(
                    new TableRow({
                        children: [
                            new TableCell({ children: [new Paragraph({ text: size, alignment: AlignmentType.CENTER })] }),
                            new TableCell({ children: [new Paragraph({ text: String(qty), alignment: AlignmentType.CENTER })] })
                        ]
                    })
                );
            });

            // Total Row
            sizeTableRows.push(
                new TableRow({
                    children: [
                        new TableCell({ 
                            children: [new Paragraph({ text: "TOTAL", bold: true, alignment: AlignmentType.RIGHT })],
                            shading: { fill: "E6E6E6" }
                        }),
                        new TableCell({ 
                            children: [new Paragraph({ text: String(data.total), bold: true, alignment: AlignmentType.CENTER })],
                            shading: { fill: "E6E6E6" }
                        })
                    ]
                })
            );

            const sizesTable = new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                alignment: AlignmentType.CENTER,
                rows: sizeTableRows,
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                    bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                    insideHorizontal: { style: BorderStyle.DOTTED, size: 1, color: "CCCCCC" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "999999" }
                }
            });

            if (productImageRun) {
                // Layout: [ Image Cell (30%) ] [ Sizes Table Cell (70%) ]
                children.push(
                    new Table({
                        width: { size: 100, type: WidthType.PERCENTAGE },
                        borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
                        rows: [
                            new TableRow({
                                children: [
                                    new TableCell({
                                        width: { size: 30, type: WidthType.PERCENTAGE },
                                        children: [new Paragraph({ children: [productImageRun], alignment: AlignmentType.CENTER })],
                                        verticalAlign: AlignmentType.CENTER
                                    }),
                                    new TableCell({
                                        width: { size: 70, type: WidthType.PERCENTAGE },
                                        children: [sizesTable],
                                        verticalAlign: AlignmentType.TOP
                                    })
                                ]
                            })
                        ]
                    })
                );
            } else {
                 const sizesTableStandalone = new Table({
                    width: { size: 80, type: WidthType.PERCENTAGE },
                    alignment: AlignmentType.CENTER,
                    rows: sizeTableRows,
                    borders: {
                        top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                        bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                        left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                        right: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
                        insideHorizontal: { style: BorderStyle.DOTTED, size: 1, color: "CCCCCC" },
                        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "999999" }
                    }
                });
                children.push(sizesTableStandalone);
            }

            children.push(new Paragraph({ text: "", spacing: { after: 300 } }));
        });

        // 3. ORDERS LIST SECTION
        children.push(
            new Paragraph({
                text: "DETALHAMENTO DE PEDIDOS",
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 400, after: 300 },
                pageBreakBefore: true,
                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC" } }
            })
        );

        // Master Table for Orders
        const orderHeaderColor = "2E74B5";
        const orderHeaderTextColor = "FFFFFF";

        // Table Header
        const ordersTableRows = [
            new TableRow({
                tableHeader: true,
                children: [
                    new TableCell({ 
                        children: [new Paragraph({ text: "PEDIDO / CLIENTE", bold: true, color: orderHeaderTextColor })],
                        shading: { fill: orderHeaderColor },
                        width: { size: 35, type: WidthType.PERCENTAGE }
                    }),
                    new TableCell({ 
                        children: [new Paragraph({ text: "ITENS DO PEDIDO", bold: true, color: orderHeaderTextColor })],
                        shading: { fill: orderHeaderColor },
                        width: { size: 45, type: WidthType.PERCENTAGE }
                    }),
                    new TableCell({ 
                        children: [new Paragraph({ text: "DETALHES", bold: true, color: orderHeaderTextColor })],
                        shading: { fill: orderHeaderColor },
                        width: { size: 20, type: WidthType.PERCENTAGE }
                    })
                ]
            })
        ];

        campaignOrders.forEach((order, index) => {
            const itemsLines = order.parsedItems
                .filter(it => {
                    const pid = Number(it.id || it.productId || it.shirtId);
                    return shirtIds.includes(pid) || shirtNames.includes((it.name || '').trim());
            })
            .map(it => {
                let type = it.type;
                if (!type) {
                    const pid = Number(it.id || it.productId || it.shirtId);
                    const shirt = (campaign.shirts || []).find(s => s.id === pid);
                    if (shirt) type = shirt.type;
                }
                return `• ${it.qty || 1}x ${it.name} [${it.size}] - ${type || 'Tradicional'}`;
            });

            // Add formatting to items
            const itemParagraphs = itemsLines.map(line => new Paragraph({ text: line, spacing: { after: 40 } }));
            if (itemParagraphs.length === 0) itemParagraphs.push(new Paragraph({ text: "(Sem itens desta campanha)", italics: true }));

            const rowColor = index % 2 === 0 ? "FFFFFF" : "F9F9F9"; // Striped rows
            const sequentialNumber = String(index + 1).padStart(2, '0');
            
            // Resolve Phone (Order > User)
            let phone = order.customerPhone;
            if (!phone && order.User && order.User.phone) {
                phone = order.User.phone;
            }
            const phoneText = phone ? phone.replace(/^(\d{2})(\d{5})(\d{4}).*/, '($1) $2-$3') : 'Tel não inf.';

            ordersTableRows.push(
                new TableRow({
                    children: [
                        new TableCell({ 
                            children: [
                                new Paragraph({ text: `Número do pedido: #${sequentialNumber}`, bold: true }),
                                new Paragraph({ text: order.customerName, bold: true, size: 22 }),
                                new Paragraph({ text: phoneText, size: 18 }),
                                new Paragraph({ text: order.customerEmail || '', size: 18 })
                            ],
                            shading: { fill: rowColor },
                            verticalAlign: AlignmentType.CENTER
                        }),
                        new TableCell({ 
                            children: itemParagraphs,
                            shading: { fill: rowColor },
                            verticalAlign: AlignmentType.CENTER
                        }),
                        new TableCell({ 
                            children: [
                                new Paragraph({ text: new Date(order.createdAt).toLocaleDateString('pt-BR'), alignment: AlignmentType.RIGHT }),
                                new Paragraph({ text: order.paymentMethod ? order.paymentMethod.toUpperCase() : 'N/A', alignment: AlignmentType.RIGHT, size: 18 }),
                                new Paragraph({ text: `R$ ${Number(order.finalAmount).toFixed(2)}`, bold: true, alignment: AlignmentType.RIGHT })
                            ],
                            shading: { fill: rowColor },
                            verticalAlign: AlignmentType.CENTER
                        })
                    ]
                })
            );
        });

        children.push(
            new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: ordersTableRows,
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 2, color: "2E74B5" },
                    bottom: { style: BorderStyle.SINGLE, size: 2, color: "2E74B5" },
                    left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                    right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
                    insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "EEEEEE" },
                    insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" }
                }
            })
        );

        // Footer note
        children.push(
            new Paragraph({
                text: "Fim do relatório.",
                alignment: AlignmentType.CENTER,
                spacing: { before: 500 },
                color: "999999",
                italics: true
            })
        );


        const doc = new Document({
            sections: [{
                properties: {},
                children: children
            }]
        });
        
        const buffer = await Packer.toBuffer(doc);
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Disposition', `attachment; filename=pedidos-${campaign.accessCode}.docx`);
        res.send(buffer);
        
    } catch (error) {
        console.error('Erro ao gerar DOCX:', error);
        res.status(500).send('Erro ao gerar arquivo');
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
        const ordersUserId = req.query.orders || null;

        const [users, orders] = await Promise.all([
            User.findAll({ order: [['createdAt', 'DESC']] }),
            Order.findAll()
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
            let totalNetSpent = 0;
            const paymentMethodsSet = new Set();
            let lastOrderDate = null;

            userOrders.forEach(order => {
                if (order.status === 'approved') {
                    totalOrders += 1;
                    const orderTotal = parseFloat(order.finalAmount) || 0;
                    totalSpent += orderTotal;
                    const feePercent = getFeePercentByPaymentMethod(order.paymentMethod);
                    totalNetSpent += orderTotal * (1 - feePercent);
                    if (order.paymentMethod) {
                        const m = String(order.paymentMethod).toLowerCase();
                        let label = m;
                        if (m === 'pix') label = 'Pix';
                        else if (m === 'bank_transfer') label = 'Transferência';
                        else if (m === 'credit_card') label = 'Cartão de Crédito';
                        else if (m === 'debit_card') label = 'Cartão de Débito';
                        else if (m === 'prepaid_card') label = 'Cartão Pré-pago';
                        paymentMethodsSet.add(label);
                    }
                }

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
                    if (order.status === 'approved') {
                        stats.totalOrders += 1;
                    }

                    let itemsQty = 0;
                    if (Array.isArray(order.items)) {
                        order.items.forEach(it => {
                            itemsQty += it.qty || 0;
                        });
                    }
                    stats.totalItems += itemsQty;
                    if (order.status === 'approved') {
                        const orderTotal = parseFloat(order.finalAmount) || 0;
                        stats.totalSpent += orderTotal;
                    }

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

            let totalSpentFormatted = `${totalSpent.toFixed(2)}`;
            let totalNetSpentFormatted = `${totalNetSpent.toFixed(2)}`;
            try {
                totalSpentFormatted = totalSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } catch (e) {}
            try {
                totalNetSpentFormatted = totalNetSpent.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            } catch (e) {}

            return {
                ...user,
                totalOrders,
                totalSpent,
                totalSpentFormatted,
                totalNetSpent,
                totalNetSpentFormatted,
                paymentMethods: Array.from(paymentMethodsSet),
                campaigns: Object.values(campaignsMap),
                lastOrderDate
            };
        });

        let editUser = null;
        if (editUserId) {
            editUser = usersWithStats.find(u => String(u.id) === String(editUserId)) || null;
        }

        let selectedUser = null;
        let selectedUserOrders = [];
        if (ordersUserId) {
            selectedUser = usersWithStats.find(u => String(u.id) === String(ordersUserId)) || null;
            const userOrders = ordersByUser[ordersUserId] || [];
            selectedUserOrders = userOrders.map(order => {
                const val = parseFloat(order.finalAmount) || 0;
                const feePercent = getFeePercentByPaymentMethod(order.paymentMethod);
                const net = val * (1 - feePercent);
                let finalAmountFormatted = `${val.toFixed(2)}`;
                let netAmountFormatted = `${net.toFixed(2)}`;
                try {
                    finalAmountFormatted = val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } catch (e) {}
                try {
                    netAmountFormatted = net.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                } catch (e) {}

                let paymentLabel = '';
                if (order.paymentMethod) {
                    const m = String(order.paymentMethod).toLowerCase();
                    if (m === 'pix') paymentLabel = 'Pix';
                    else if (m === 'bank_transfer') paymentLabel = 'Transferência';
                    else if (m === 'credit_card') paymentLabel = 'Cartão de Crédito';
                    else if (m === 'debit_card') paymentLabel = 'Cartão de Débito';
                    else if (m === 'prepaid_card') paymentLabel = 'Cartão Pré-pago';
                    else paymentLabel = order.paymentMethod;
                }

                let campaignTitle = '';
                let campaignAccessCode = '';
                if (Array.isArray(order.items) && order.items.length > 0) {
                    const firstItem = order.items[0];
                    const shirt = shirtsById[firstItem.id];
                    if (shirt && shirt.Campaign) {
                        campaignTitle = shirt.Campaign.title || '';
                        campaignAccessCode = shirt.Campaign.accessCode || '';
                    }
                }

                let itemsQty = 0;
                let itemsDetailed = [];
                if (Array.isArray(order.items)) {
                    itemsDetailed = order.items.map(it => {
                        const qty = it && it.qty ? it.qty : 0;
                        itemsQty += qty;
                        const pid = it && (it.id ?? it.productId ?? it.shirtId);
                        let shirt = null;
                        if (pid != null && shirtsById[pid]) {
                            shirt = shirtsById[pid];
                        }
                        let thumb = null;
                        if (shirt && Array.isArray(shirt.images) && shirt.images.length > 0) {
                            thumb = shirt.images[0];
                        } else if (it && it.image) {
                            thumb = it.image;
                        } else if (it && it.imageUrl) {
                            thumb = it.imageUrl;
                        }
                        const name = it && it.name ? it.name : (shirt ? shirt.name : 'Item');
                        return {
                            ...it,
                            displayName: name,
                            thumb
                        };
                    });
                }

                return {
                    ...order,
                    finalAmountFormatted,
                    items: itemsDetailed,
                    netAmount: net,
                    netAmountFormatted,
                    paymentMethodLabel: paymentLabel,
                    campaignTitle,
                    campaignAccessCode,
                    itemsQty
                };
            });
        }

        res.render('admin/client-campaigns', {
            title: 'Clientes e Campanhas',
            layout: 'main',
            isClients: true,
            users: usersWithStats,
            editUser,
            selectedUser,
            selectedUserOrders
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
        res.redirect('/auth/login');
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
