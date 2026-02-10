const { Order, User } = require('../models');

const OrderController = {
    // Render Checkout Page
    checkoutPage(req, res) {
        // If user is logged in, pass user data to pre-fill form
        const user = req.session.user || null;
        res.render('shop/checkout', {
            title: 'Finalizar Compra',
            layout: 'main',
            user: user,
            // We might want to pass the campaign if needed for styling, 
            // but usually checkout is generic or we need to know which campaign.
            // Since cart is client-side, we don't know the campaign here easily unless passed or stored in session.
            // For now, let's assume a generic checkout or minimalist style.
        });
    },

    // Render Order History Page
    async historyPage(req, res) {
        try {
            if (!req.session.user) {
                return res.redirect('/auth/login');
            }

            const orders = await Order.findAll({
                where: { userId: req.session.user.id },
                order: [['createdAt', 'DESC']]
            });

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
                user: req.session.user
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
