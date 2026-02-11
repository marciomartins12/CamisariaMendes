const bcrypt = require('bcrypt');
const { Admin } = require('./src/models');

(async () => {
    try {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        
        // Tenta encontrar o admin primeiro
        const admin = await Admin.findOne({ where: { username: 'admin' } });

        if (admin) {
            await admin.update({ password: hashedPassword });
            console.log('Senha do usuário "admin" atualizada para "admin123".');
        } else {
            await Admin.create({
                username: 'admin',
                email: 'admin@camisariamendes.com.br',
                password: hashedPassword,
                role: 'admin'
            });
            console.log('Usuário "admin" criado com senha "admin123".');
        }
    } catch (error) {
        console.error('Erro ao gerenciar admin:', error);
    }
    process.exit();
})();
