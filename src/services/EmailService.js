const nodemailer = require('nodemailer');
const path = require('path');

// Configuração do Transportador
// Em produção, use variáveis de ambiente para segurança
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', // Ex: smtp.gmail.com ou smtp-relay.brevo.com
    port: process.env.SMTP_PORT || 587,
    secure: false, // true para 465, false para outras portas
    auth: {
        user: process.env.SMTP_USER, // Seu e-mail ou usuário API
        pass: process.env.SMTP_PASS  // Sua senha de app ou chave API
    },
    tls: {
        rejectUnauthorized: false // Em desenvolvimento pode ser necessário mas ta em producao ja direto
    }
});

const EmailService = {
    // Formatar moeda BRL
    formatCurrency: (value) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    },

    // Enviar nova senha (Recuperação de Senha)
    async sendNewPassword(email, newPassword) {
        if (!email) return;

        try {
            const logoPath = path.join(__dirname, '../public/images/logoSemFundo.png');

            const mailOptions = {
                from: `"Camisaria Mendes" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: email,
                subject: `Nova Senha - Camisaria Mendes`,
                html: `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                        <!-- Header -->
                        <div style="background-color: #1e293b; padding: 30px 20px; text-align: center;">
                            <img src="cid:logo_camisaria" alt="Camisaria Mendes" style="max-height: 80px; width: auto; display: block; margin: 0 auto;">
                        </div>
                        
                        <!-- Body -->
                        <div style="padding: 30px;">
                            <div style="text-align: center; margin-bottom: 30px;">
                                <h2 style="color: #1e293b; margin-top: 0; font-size: 24px;">Recuperação de Senha</h2>
                                <p style="color: #64748b; font-size: 16px; line-height: 1.5;">Recebemos uma solicitação para redefinir sua senha.</p>
                            </div>
                            
                            <div style="background-color: #f8fafc; padding: 25px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e2e8f0; text-align: center;">
                                <p style="margin: 0 0 10px 0; color: #64748b; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Sua nova senha é:</p>
                                <div style="font-size: 32px; font-weight: bold; color: #0f172a; letter-spacing: 2px; padding: 10px; background: white; border-radius: 6px; display: inline-block; border: 2px dashed #cbd5e1;">
                                    ${newPassword}
                                </div>
                                <p style="margin: 15px 0 0 0; color: #ef4444; font-size: 13px;">Recomendamos que você altere esta senha após fazer login.</p>
                            </div>

                            <p style="color: #64748b; font-size: 14px; line-height: 1.5; text-align: center;">
                                Se você não solicitou esta alteração, entre em contato conosco imediatamente.
                            </p>
                            
                            <div style="text-align: center; margin-top: 30px;">
                                <a href="${process.env.APP_URL || 'http://localhost:3000'}/auth/login" style="background-color: #0f172a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Fazer Login</a>
                            </div>
                        </div>
                        
                        <!-- Footer -->
                        <div style="background-color: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="color: #94a3b8; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} Camisaria Mendes. Todos os direitos reservados.</p>
                        </div>
                    </div>
                `,
                attachments: [{
                    filename: 'logo.png',
                    path: logoPath,
                    cid: 'logo_camisaria'
                }]
            };

            const info = await transporter.sendMail(mailOptions);
            console.log('Email de nova senha enviado: %s', info.messageId);
            return true;
        } catch (error) {
            console.error('Erro ao enviar email de nova senha:', error);
            return false;
        }
    },

    // Enviar confirmação de Pedido Recebido (Pendente de Pagamento)
    async sendOrderReceived(order) {
        if (!order || !order.customerEmail) return;

        try {
            const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            const itemsHtml = items.map(item => `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #334155;">
                        <strong>${item.name}</strong><br>
                        <span style="font-size: 12px; color: #64748b;">Corte: ${item.type || 'Tradicional'}</span><br>
                        <span style="font-size: 12px; color: #64748b;">Cor: ${item.color || 'Padrão'}</span><br>
                        <span style="font-size: 12px; color: #64748b;">Tamanho: ${item.size || 'N/A'}</span>
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #334155;">${item.qty}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155;">R$ ${parseFloat(item.price).toFixed(2)}</td>
                </tr>
            `).join('');

            const logoPath = path.join(__dirname, '../public/images/logoSemFundo.png');

            const mailOptions = {
                from: `"Camisaria Mendes" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: order.customerEmail,
                subject: `Pedido #${order.id} Recebido - Camisaria Mendes`,
                html: `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                        <!-- Header -->
                        <div style="background-color: #1e293b; padding: 30px 20px; text-align: center;">
                            <img src="cid:logo_camisaria" alt="Camisaria Mendes" style="max-height: 80px; width: auto; display: block; margin: 0 auto;">
                        </div>
                        
                        <!-- Body -->
                        <div style="padding: 30px;">
                            <div style="text-align: center; margin-bottom: 30px;">
                                <h2 style="color: #1e293b; margin-top: 0; font-size: 24px;">Pedido Recebido!</h2>
                                <p style="color: #64748b; font-size: 16px; line-height: 1.5;">Obrigado por comprar conosco, <strong>${order.customerName || 'Cliente'}</strong>.<br>Recebemos seu pedido e estamos aguardando a confirmação do pagamento.</p>
                            </div>
                            
                            <!-- Order Info Box -->
                            <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #e2e8f0;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 5px 0; color: #64748b; font-size: 14px;">Número do Pedido:</td>
                                        <td style="padding: 5px 0; text-align: right; font-weight: bold; color: #1e293b;">#${order.id}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 5px 0; color: #64748b; font-size: 14px;">Data:</td>
                                        <td style="padding: 5px 0; text-align: right; font-weight: bold; color: #1e293b;">${new Date().toLocaleDateString('pt-BR')}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 5px 0; color: #64748b; font-size: 14px;">Status:</td>
                                        <td style="padding: 5px 0; text-align: right; font-weight: bold; color: #f59e0b;">Aguardando Pagamento</td>
                                    </tr>
                                </table>
                            </div>

                            <h3 style="color: #334155; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">Itens do Pedido</h3>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                                <thead>
                                    <tr style="background-color: #f1f5f9;">
                                        <th style="padding: 10px; text-align: left; color: #475569; font-weight: 600; border-radius: 6px 0 0 6px;">Produto</th>
                                        <th style="padding: 10px; text-align: center; color: #475569; font-weight: 600;">Qtd</th>
                                        <th style="padding: 10px; text-align: right; color: #475569; font-weight: 600; border-radius: 0 6px 6px 0;">Preço</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="2" style="padding: 10px; text-align: right; color: #64748b; border-top: 2px solid #e2e8f0;">Subtotal:</td>
                                        <td style="padding: 10px; text-align: right; color: #64748b; border-top: 2px solid #e2e8f0;">R$ ${parseFloat(order.totalAmount).toFixed(2)}</td>
                                    </tr>
                                    ${order.discountAmount > 0 ? `
                                    <tr>
                                        <td colspan="2" style="padding: 10px; text-align: right; color: #16a34a;">Desconto (${order.couponCode || 'Cupom'}):</td>
                                        <td style="padding: 10px; text-align: right; color: #16a34a;">- R$ ${parseFloat(order.discountAmount).toFixed(2)}</td>
                                    </tr>
                                    ` : ''}
                                    <tr>
                                        <td colspan="2" style="padding: 15px 10px; text-align: right; font-weight: bold; color: #334155; border-top: 1px solid #e2e8f0;">Total:</td>
                                        <td style="padding: 15px 10px; text-align: right; font-weight: bold; color: #1e293b; font-size: 16px; border-top: 1px solid #e2e8f0;">R$ ${parseFloat(order.finalAmount).toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>

                            <div style="background-color: #fff7ed; border-left: 4px solid #f97316; padding: 15px; margin-top: 20px; border-radius: 4px;">
                                <p style="margin: 0; color: #9a3412; font-size: 14px;">
                                    <strong>Atenção:</strong> Se você escolheu pagar via Pix, utilize o código gerado na tela de checkout. O pedido só será processado após a confirmação.
                                </p>
                            </div>
                        </div>
                        
                        <!-- Footer -->
                        <div style="background-color: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">Dúvidas? Entre em contato conosco.</p>
                            <p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; ${new Date().getFullYear()} Camisaria Mendes. Todos os direitos reservados.</p>
                        </div>
                    </div>
                `,
                attachments: [{
                    filename: 'logo-camisaria.png',
                    path: logoPath,
                    cid: 'logo_camisaria'
                }]
            };

            await transporter.sendMail(mailOptions);
            console.log(`E-mail de pedido recebido enviado para ${order.customerEmail}`);
        } catch (error) {
            console.error('Erro ao enviar e-mail de pedido recebido:', error);
        }
    },

    // Enviar confirmação de Pagamento Aprovado
    async sendPaymentConfirmation(order) {
        if (!order || !order.customerEmail) return;

        try {
            const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            const itemsHtml = items.map(item => `
                <tr>
                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; color: #334155;">
                        <strong>${item.name}</strong><br>
                        <span style="font-size: 12px; color: #64748b;">Corte: ${item.type || 'Tradicional'}</span><br>
                        <span style="font-size: 12px; color: #64748b;">Cor: ${item.color || 'Padrão'}</span><br>
                        <span style="font-size: 12px; color: #64748b;">Tamanho: ${item.size || 'N/A'}</span>
                    </td>
                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #334155;">${item.qty}</td>
                    <td style="padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: right; color: #334155;">R$ ${parseFloat(item.price).toFixed(2)}</td>
                </tr>
            `).join('');

            const logoPath = path.join(__dirname, '../public/images/logoSemFundo.png');

            const mailOptions = {
                from: `"Camisaria Mendes" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
                to: order.customerEmail,
                subject: `Pagamento Aprovado - Pedido #${order.id}`,
                html: `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
                        <!-- Header -->
                        <div style="background-color: #1e293b; padding: 30px 20px; text-align: center;">
                            <img src="cid:logo_camisaria" alt="Camisaria Mendes" style="max-height: 80px; width: auto; display: block; margin: 0 auto;">
                        </div>
                        
                        <!-- Body -->
                        <div style="padding: 30px;">
                            <div style="text-align: center; margin-bottom: 30px;">
                                <h2 style="color: #16a34a; margin-top: 0; font-size: 24px;">Pagamento Confirmado! 🎉</h2>
                                <p style="color: #64748b; font-size: 16px; line-height: 1.5;">Olá, <strong>${order.customerName || 'Cliente'}</strong>.<br>Recebemos seu pagamento e seu pedido já está sendo processado.</p>
                            </div>
                            
                            <!-- Order Info Box -->
                            <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #bbf7d0;">
                                <table style="width: 100%; border-collapse: collapse;">
                                    <tr>
                                        <td style="padding: 5px 0; color: #64748b; font-size: 14px;">Número do Pedido:</td>
                                        <td style="padding: 5px 0; text-align: right; font-weight: bold; color: #1e293b;">#${order.id}</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 5px 0; color: #64748b; font-size: 14px;">Status:</td>
                                        <td style="padding: 5px 0; text-align: right; font-weight: bold; color: #16a34a;">Pago / Aprovado</td>
                                    </tr>
                                    <tr>
                                        <td style="padding: 5px 0; color: #64748b; font-size: 14px;">Forma de Pagamento:</td>
                                        <td style="padding: 5px 0; text-align: right; font-weight: bold; color: #1e293b;">${order.paymentMethod ? order.paymentMethod.toUpperCase() : 'PIX/CARTÃO'}</td>
                                    </tr>
                                </table>
                            </div>

                            <h3 style="color: #334155; font-size: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">Resumo do Pedido</h3>
                            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
                                <thead>
                                    <tr style="background-color: #f1f5f9;">
                                        <th style="padding: 10px; text-align: left; color: #475569; font-weight: 600; border-radius: 6px 0 0 6px;">Produto</th>
                                        <th style="padding: 10px; text-align: center; color: #475569; font-weight: 600;">Qtd</th>
                                        <th style="padding: 10px; text-align: right; color: #475569; font-weight: 600; border-radius: 0 6px 6px 0;">Preço</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="2" style="padding: 10px; text-align: right; color: #64748b; border-top: 2px solid #e2e8f0;">Subtotal:</td>
                                        <td style="padding: 10px; text-align: right; color: #64748b; border-top: 2px solid #e2e8f0;">R$ ${parseFloat(order.totalAmount).toFixed(2)}</td>
                                    </tr>
                                    ${order.discountAmount > 0 ? `
                                    <tr>
                                        <td colspan="2" style="padding: 10px; text-align: right; color: #16a34a;">Desconto (${order.couponCode || 'Cupom'}):</td>
                                        <td style="padding: 10px; text-align: right; color: #16a34a;">- R$ ${parseFloat(order.discountAmount).toFixed(2)}</td>
                                    </tr>
                                    ` : ''}
                                    <tr>
                                        <td colspan="2" style="padding: 15px 10px; text-align: right; font-weight: bold; color: #334155; border-top: 1px solid #e2e8f0;">Total Pago:</td>
                                        <td style="padding: 15px 10px; text-align: right; font-weight: bold; color: #16a34a; font-size: 16px; border-top: 1px solid #e2e8f0;">R$ ${parseFloat(order.finalAmount).toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>

                            <p style="color: #64748b; font-size: 14px; text-align: center; margin-top: 30px;">
                                Seu pedido será preparado com todo cuidado. Você receberá atualizações sobre o status da produção/envio por aqui.
                            </p>
                        </div>
                        
                        <!-- Footer -->
                        <div style="background-color: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
                            <p style="margin: 0 0 10px 0; font-size: 14px; color: #64748b;">Camisaria Mendes - Qualidade e Estilo</p>
                            <div style="margin-bottom: 10px;">
                                <a href="${process.env.APP_URL || '#'}" style="text-decoration: none; color: #2563eb; font-size: 14px; margin: 0 10px;">Visite nosso site</a>
                                <a href="https://instagram.com/${process.env.INSTAGRAM_USER || 'camisariamendes'}" style="text-decoration: none; color: #2563eb; font-size: 14px; margin: 0 10px;">Instagram</a>
                            </div>
                            <p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; ${new Date().getFullYear()} Camisaria Mendes.</p>
                        </div>
                    </div>
                `,
                attachments: [{
                    filename: 'logo-camisaria.png',
                    path: logoPath,
                    cid: 'logo_camisaria'
                }]
            };

            await transporter.sendMail(mailOptions);
            console.log(`E-mail de pagamento aprovado enviado para ${order.customerEmail}`);
        } catch (error) {
            console.error('Erro ao enviar e-mail de pagamento aprovado: por favor verifique as configurações do SMTP.', error); 
        }
    }
};

module.exports = EmailService;