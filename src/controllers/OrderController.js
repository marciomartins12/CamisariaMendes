const { Order, User } = require('../models');
const { Op } = require('sequelize');

const OrderController = {
    // Render Checkout Page
    checkoutPage(req, res) {
        const user = req.session.user || null;
        res.render('shop/checkout', {
            title: 'Finalizar Compra',
            layout: 'main',
            user: user
        });
    },

    // Render Payment Page (after checkout)
    async paymentPage(req, res) {
        try {
            const { orderId } = req.params;
            const order = await Order.findByPk(orderId);

            if (!order) {
                return res.redirect('/meus-pedidos');
            }

            const orderPlain = order.get({ plain: true });

            res.render('shop/checkout-payment', {
                title: `Pagamento do Pedido #${orderPlain.id}`,
                layout: 'main',
                order: orderPlain,
                mpPublicKey: process.env.MP_PUBLIC_KEY || ''
            });
        } catch (error) {
            console.error('Error rendering payment page:', error);
            res.redirect('/meus-pedidos');
        }
    },

    // Render Order History Page
    async historyPage(req, res) {
        try {
            if (!req.session.user) {
                return res.redirect('/auth/login');
            }

            // Auto-delete pending orders older than 2 days
            const twoDaysAgo = new Date();
            twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
            
            const deletedCount = await Order.destroy({
                where: {
                    status: 'pending',
                    createdAt: { [Op.lt]: twoDaysAgo }
                }
            });

            if (deletedCount > 0) {
                console.log(`[OrderController] Auto-deleted ${deletedCount} expired pending orders.`);
            }

            const pageParam = parseInt(req.query.page, 10);
            const currentPage = Number.isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
            const perPage = 10; // Increased from 3 to 10 for better visibility
            const offset = (currentPage - 1) * perPage;

            let orders = [];
            let totalOrders = 0;
            const rawEmail = (req.session.user.email || '').trim();
            
            // Build Where Clause
            const whereConditions = [];
            
            // 1. By User ID (Primary)
            if (req.session.user.id) {
                whereConditions.push({ userId: req.session.user.id });
            }
            
            // 2. By Email (Guest checkout fallback)
            if (rawEmail) {
                whereConditions.push({ customerEmail: rawEmail });
            }

            const whereClause = {
                status: { [Op.in]: ['approved', 'pending', 'rejected', 'cancelled'] }
            };

            // Optimize query: use OR only if multiple conditions exist
            if (whereConditions.length > 1) {
                whereClause[Op.or] = whereConditions;
            } else if (whereConditions.length === 1) {
                // Flatten condition
                Object.assign(whereClause, whereConditions[0]);
            } else {
                 // Force empty result
                 whereClause.id = -1;
            }

            try {
                const result = await Order.findAndCountAll({
                    where: whereClause,
                    order: [['createdAt', 'DESC']],
                    limit: perPage,
                    offset
                });
                
                orders = result.rows || [];
                totalOrders = result.count || 0;
            } catch (dbError) {
                console.error('Error fetching orders from DB:', dbError);
                orders = [];
            }

            const totalPages = Math.max(1, Math.ceil(totalOrders / perPage));
            const safeCurrentPage = Math.min(currentPage, totalPages);
            const hasPrev = safeCurrentPage > 1;
            const hasNext = safeCurrentPage < totalPages;
            const prevPage = hasPrev ? safeCurrentPage - 1 : 1;
            const nextPage = hasNext ? safeCurrentPage + 1 : totalPages;

            // Parse items JSON for display
            const ordersPlain = orders.map(order => {
                const plain = order.get({ plain: true });
                try {
                    if (typeof plain.items === 'string') {
                        plain.items = JSON.parse(plain.items);
                        // Double check if it's still a string (double stringified)
                        if (typeof plain.items === 'string') {
                            plain.items = JSON.parse(plain.items);
                        }
                    }
                    // Ensure it is an array
                    if (!Array.isArray(plain.items)) {
                         console.warn(`Order ${plain.id} items is not an array:`, plain.items);
                         plain.items = [];
                    }
                } catch (e) {
                    console.error(`Error parsing items for order ${plain.id}:`, e);
                    plain.items = [];
                }
                return plain;
            });

            res.render('shop/orders', {
                title: 'Meus Pedidos',
                layout: 'main',
                orders: ordersPlain,
                user: req.session.user,
                hasPagination: totalPages > 1,
                currentPage: safeCurrentPage,
                totalPages,
                hasPrev,
                hasNext,
                prevPage,
                nextPage
            });
        } catch (error) {
            console.error('Error fetching orders:', error);
            res.render('shop/orders', {
                title: 'Meus Pedidos',
                layout: 'main',
                error: 'Erro ao carregar histórico.',
                user: req.session.user
            });
        }
    },
    // Delete Order (Only Pending/Rejected/Cancelled)
    async deleteOrder(req, res) {
        try {
            if (!req.session.user) return res.status(401).json({ error: 'Não autorizado.' });
            
            const { id } = req.params;
            const order = await Order.findOne({ 
                where: { id: id, userId: req.session.user.id } 
            });

            if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });

            if (['approved'].includes(order.status)) {
                return res.status(400).json({ error: 'Não é possível excluir pedidos aprovados.' });
            }

            await order.destroy();

            res.json({ message: 'Pedido excluído com sucesso.' });
        } catch (error) {
            console.error('Delete Order Error:', error);
            res.status(500).json({ error: 'Erro ao excluir pedido.' });
        }
    },
};

module.exports = OrderController;
