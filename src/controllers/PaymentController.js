const mercadopago = require('mercadopago');
const { Order, Coupon } = require('../models');

// Configure Mercado Pago
// In production, use process.env.MP_ACCESS_TOKEN
const client = new mercadopago.MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
const preference = new mercadopago.Preference(client);

const PaymentController = {
    async createPreference(req, res) {
        try {
            const { items, payer, couponCode } = req.body;

            // --- Validation ---
            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: 'Carrinho vazio ou inválido.' });
            }
            if (!payer || !payer.email) {
                return res.status(400).json({ error: 'Dados do pagador incompletos (Email obrigatório).' });
            }

            // --- 1. Calculate Total ---
            let totalAmount = items.reduce((acc, item) => acc + (parseFloat(item.price) * parseInt(item.qty)), 0);
            let discountAmount = 0;
            let finalAmount = totalAmount;

            // --- 2. Validate Coupon (if provided) ---
            if (couponCode) {
                const coupon = await Coupon.findOne({ 
                    where: { code: couponCode.toUpperCase(), status: 'active' } 
                });

                if (coupon) {
                    if (coupon.discountType === 'percentage') {
                        discountAmount = totalAmount * (parseFloat(coupon.discountValue) / 100);
                    } else {
                        discountAmount = parseFloat(coupon.discountValue);
                    }
                    // Ensure discount doesn't exceed total
                    if (discountAmount > totalAmount) discountAmount = totalAmount;
                    finalAmount = totalAmount - discountAmount;
                }
            }

            // --- 3. Create Order in Database (Pending) ---
            const userId = req.session && req.session.user ? req.session.user.id : null;

            const newOrder = await Order.create({
                items: JSON.stringify(items),
                totalAmount,
                discountAmount,
                finalAmount,
                couponCode: couponCode ? couponCode.toUpperCase() : null,
                customerName: payer.name,
                customerEmail: payer.email,
                customerPhone: payer.phone,
                status: 'pending',
                userId: userId
            });

            // --- 4. Prepare Data for Mercado Pago ---
            
            // Clean Phone Number
            let areaCode = '11';
            let number = '999999999';
            
            if (payer.phone) {
                const cleanPhone = payer.phone.replace(/\D/g, ''); // Remove non-digits
                if (cleanPhone.length >= 10) {
                    areaCode = cleanPhone.substring(0, 2);
                    number = cleanPhone.substring(2);
                } else {
                    number = cleanPhone;
                }
            }

            // Split Name
            const nameParts = payer.name ? payer.name.trim().split(' ') : ['Cliente', 'Mendes'];
            const firstName = nameParts[0];
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Cliente';

            // Base URL Logic
            // In production, ALWAYS use APP_URL from env
            const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

            console.log('Payment Base URL:', baseUrl);

            // Create Preference
            const preferenceData = {
                body: {
                    items: items.map(item => ({
                        title: item.name,
                        unit_price: parseFloat(item.price),
                        quantity: parseInt(item.qty),
                        currency_id: 'BRL',
                        description: `Tamanho: ${item.size}`
                    })),
                    payer: {
                        name: firstName,
                        surname: lastName,
                        email: payer.email,
                        phone: {
                            area_code: areaCode,
                            number: number
                        }
                    },
                    external_reference: newOrder.id.toString(),
                    payment_methods: {
                        excluded_payment_types: [
                            { id: "ticket" } 
                        ],
                        installments: 12
                    },
                    back_urls: {
                        success: `${baseUrl}/payment/success`,
                        failure: `${baseUrl}/payment/failure`,
                        pending: `${baseUrl}/payment/pending`
                    },
                    notification_url: `${baseUrl}/api/webhook`,
                    auto_return: "approved",
                    binary_mode: true, 
                    statement_descriptor: "CAMISARIAMENDES",
                }
            };

            console.log('MP Preference Body:', JSON.stringify(preferenceData.body, null, 2));

            // Add discount logic
            if (discountAmount > 0) {
                preferenceData.body.items.push({
                    title: 'Desconto (Cupom)',
                    unit_price: -parseFloat(discountAmount.toFixed(2)),
                    quantity: 1,
                    currency_id: 'BRL'
                });
            }

            const response = await preference.create(preferenceData);

            res.json({ 
                preferenceId: response.id, 
                init_point: response.init_point,
                orderId: newOrder.id 
            });

        } catch (error) {
            console.error('CRITICAL ERROR creating MP preference:', error);
            // Return detailed error for debugging (remove details in strict production if needed, but useful now)
            res.status(500).json({ 
                error: 'Erro ao processar pagamento.', 
                details: error.message,
                mp_error: error.cause || null 
            });
        }
    },

    async webhook(req, res) {
        try {
            const { type, data } = req.body;

            if (type === 'payment') {
                 const payment = new mercadopago.Payment(client);
                 const paymentInfo = await payment.get({ id: data.id });
                 
                 const externalReference = paymentInfo.external_reference; // This is our Order ID
                 const order = await Order.findByPk(externalReference);

                 if (order) {
                     await PaymentController.processPaymentUpdate(order, paymentInfo);
                 }
            }

            res.sendStatus(200);
        } catch (error) {
            console.error('Webhook error:', error);
            res.sendStatus(500);
        }
    },

    // Resume Payment (Create new preference for existing order)
    async continuePayment(req, res) {
        try {
            const { orderId } = req.params;
            const order = await Order.findByPk(orderId);

            if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
            if (order.status !== 'pending') return res.status(400).json({ error: 'Este pedido não está pendente de pagamento.' });

            // Reconstruct Data
            let items = [];
            try {
                if (typeof order.items === 'string') {
                    items = JSON.parse(order.items);
                    if (typeof items === 'string') {
                        items = JSON.parse(items);
                    }
                } else {
                    items = order.items;
                }

                if (!Array.isArray(items)) {
                    console.warn(`Order ${order.id} items is not an array (continuePayment):`, items);
                    items = [{ name: `Pedido #${order.id}`, price: order.totalAmount, qty: 1, size: 'N/A' }];
                }
            } catch (e) {
                console.error(`Error parsing items for order ${order.id} (continuePayment):`, e);
                items = [{ name: `Pedido #${order.id}`, price: order.totalAmount, qty: 1, size: 'N/A' }];
            }

            // Clean Phone Number
            let areaCode = '11';
            let number = '999999999';
            if (order.customerPhone) {
                const cleanPhone = order.customerPhone.replace(/\D/g, '');
                if (cleanPhone.length >= 10) {
                    areaCode = cleanPhone.substring(0, 2);
                    number = cleanPhone.substring(2);
                } else {
                    number = cleanPhone;
                }
            }

            // Split Name
            const nameParts = order.customerName ? order.customerName.trim().split(' ') : ['Cliente', 'Mendes'];
            const firstName = nameParts[0];
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Cliente';

            // Base URL Logic
            // In production, ALWAYS use APP_URL from env
            const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

            // Create Preference
            const preferenceData = {
                body: {
                    items: items.map(item => ({
                        title: item.name,
                        unit_price: parseFloat(item.price),
                        quantity: parseInt(item.qty),
                        currency_id: 'BRL',
                        description: `Tamanho: ${item.size}`
                    })),
                    payer: {
                        name: firstName,
                        surname: lastName,
                        email: order.customerEmail || 'cliente@email.com',
                        phone: {
                            area_code: areaCode,
                            number: number
                        }
                    },
                    external_reference: order.id.toString(),
                    payment_methods: {
                        excluded_payment_types: [{ id: "ticket" }],
                        installments: 12
                    },
                    back_urls: {
                        success: `${baseUrl}/payment/success`,
                        failure: `${baseUrl}/payment/failure`,
                        pending: `${baseUrl}/payment/pending`
                    },
                    notification_url: `${baseUrl}/api/webhook`,
                    auto_return: "approved",
                    binary_mode: true,
                    statement_descriptor: "CAMISARIAMENDES",
                }
            };

            // Add discount logic
            if (parseFloat(order.discountAmount) > 0) {
                preferenceData.body.items.push({
                    title: 'Desconto (Cupom)',
                    unit_price: -parseFloat(order.discountAmount),
                    quantity: 1,
                    currency_id: 'BRL'
                });
            }

            const response = await preference.create(preferenceData);

            res.json({ 
                init_point: response.init_point 
            });

        } catch (error) {
            console.error('Continue Payment Error:', error);
            res.status(500).json({ 
                error: 'Erro ao gerar novo link de pagamento.',
                details: error.message
            });
        }
    },

    // Helper to process payment update (Shared by Webhook and Manual Check)
    async processPaymentUpdate(order, paymentInfo) {
        const status = paymentInfo.status;
        
        // Prevent double processing if already approved
        if (order.status === 'approved' && status === 'approved') {
            return;
        }

        if (status === 'approved') {
            order.status = 'approved';
            order.paymentMethod = paymentInfo.payment_method_id;
            order.transactionId = paymentInfo.id.toString();
            await order.save();

            // Increment Coupon Usage
            if (order.couponCode) {
                const coupon = await Coupon.findOne({ where: { code: order.couponCode } });
                if (coupon) {
                    coupon.usageCount += 1;
                    await coupon.save();
                }
            }
        } else if (status === 'rejected' || status === 'cancelled') {
            order.status = status;
            await order.save();
        }
    },

    // Manual Status Check (For Dev/User fallback)
    async checkStatus(req, res) {
        try {
            const { orderId } = req.params;
            const order = await Order.findByPk(orderId);

            if (!order) {
                return res.status(404).json({ error: 'Pedido não encontrado.' });
            }

            // Search for payment in MP by external_reference (Order ID)
            const paymentSearch = new mercadopago.Payment(client);
            const searchResult = await paymentSearch.search({
                options: {
                    external_reference: order.id.toString()
                }
            });

            if (searchResult.results && searchResult.results.length > 0) {
                // Get the latest payment attempt
                const lastPayment = searchResult.results[searchResult.results.length - 1];
                
                await PaymentController.processPaymentUpdate(order, lastPayment);
                
                res.json({ 
                    status: order.status, 
                    message: 'Status atualizado com sucesso!',
                    paymentStatus: lastPayment.status
                });
            } else {
                res.json({ 
                    status: order.status, 
                    message: 'Nenhum pagamento encontrado ainda.' 
                });
            }

        } catch (error) {
            console.error('Check Status Error:', error);
            res.status(500).json({ error: 'Erro ao verificar status.' });
        }
    }
};

module.exports = PaymentController;
