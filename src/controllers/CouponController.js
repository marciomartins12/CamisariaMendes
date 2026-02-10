const { Coupon } = require('../models');

const CouponController = {
    async validate(req, res) {
        try {
            const { code } = req.body;
            
            if (!code) {
                return res.status(400).json({ valid: false, message: 'Código do cupom é obrigatório' });
            }

            const coupon = await Coupon.findOne({ 
                where: { 
                    code: code.toUpperCase(),
                    status: 'active'
                } 
            });

            if (!coupon) {
                return res.json({ valid: false, message: 'Cupom inválido ou expirado' });
            }

            return res.json({
                valid: true,
                coupon: {
                    code: coupon.code,
                    discountType: coupon.discountType,
                    discountValue: parseFloat(coupon.discountValue)
                }
            });

        } catch (error) {
            console.error('Error validating coupon:', error);
            return res.status(500).json({ valid: false, message: 'Erro interno ao validar cupom' });
        }
    },

    async registerUsage(req, res) {
        try {
            const { code } = req.body;
            
            if (!code) {
                return res.status(400).json({ success: false, message: 'Código é obrigatório' });
            }

            const coupon = await Coupon.findOne({ 
                where: { 
                    code: code.toUpperCase(),
                    status: 'active'
                } 
            });

            if (!coupon) {
                return res.status(404).json({ success: false, message: 'Cupom não encontrado ou inativo' });
            }

            // Increment usage
            coupon.usageCount += 1;
            await coupon.save();

            return res.json({ success: true, message: 'Uso registrado com sucesso' });

        } catch (error) {
            console.error('Error registering usage:', error);
            return res.status(500).json({ success: false, message: 'Erro ao registrar uso' });
        }
    }
};

module.exports = CouponController;
