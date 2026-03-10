const { Campaign, Shirt, Order, User } = require('./src/models');

async function seedTestData() {
  try {
    // 1. Buscar a campanha mais recente com produtos
    const campaign = await Campaign.findOne({
      order: [['id', 'DESC']],
      include: [{ model: Shirt, as: 'shirts' }]
    });

    if (!campaign || !campaign.shirts || campaign.shirts.length === 0) {
      console.log('Nenhuma campanha com produtos encontrada.');
      return;
    }

    console.log(`Usando Campanha: ${campaign.title} (ID: ${campaign.id})`);

    const shirt = campaign.shirts[0];
    const originalColors = shirt.color;
    const sizes = shirt.sizes.split(',').map(s => s.trim());

    // Se as cores não forem um array ou estiverem vazias, forçar para o teste
    if (!Array.isArray(originalColors) || originalColors.length < 2) {
      console.log('O produto precisa ter pelo menos 2 cores para o teste de separação.');
      shirt.color = ['Preto', 'Branco', 'Azul'];
      await shirt.save();
      console.log('Cores forçadas para o teste: Preto, Branco, Azul');
    }

    // Recarregar cores após possível alteração
    const testColors = Array.isArray(shirt.color) ? shirt.color : [shirt.color];
    
    // 2. Criar alguns pedidos de teste
    const testOrders = [
      { name: 'João Silva', color: testColors[0], size: sizes[0], qty: 2 },
      { name: 'Maria Oliveira', color: testColors[1 % testColors.length], size: sizes[1 % sizes.length], qty: 1 },
      { name: 'Pedro Santos', color: testColors[0], size: sizes[1 % sizes.length], qty: 3 },
      { name: 'Ana Costa', color: testColors[2 % testColors.length] || testColors[0], size: sizes[0], qty: 1 },
      { name: 'Lucas Lima', color: testColors[1 % testColors.length], size: sizes[0], qty: 2 },
    ];

    for (const data of testOrders) {
      const totalAmount = shirt.price * data.qty;
      const items = [{
        id: shirt.id,
        name: shirt.name,
        price: shirt.price,
        size: data.size,
        color: data.color,
        type: shirt.type,
        qty: data.qty,
        image: (shirt.images && shirt.images.length > 0) ? shirt.images[0] : null
      }];

      await Order.create({
        customerName: data.name,
        customerEmail: `${data.name.toLowerCase().replace(' ', '.')}@teste.com`,
        customerPhone: '11999999999',
        status: 'approved', // Aprovado para aparecer no resumo de vendas
        totalAmount: totalAmount,
        discountAmount: 0.00,
        finalAmount: totalAmount,
        items: JSON.stringify(items),
        paymentMethod: 'Teste/Simulação',
        transactionId: 'simulated_' + Math.random().toString(36).substr(2, 9)
      });
      console.log(`Pedido criado para ${data.name}: ${data.qty}x ${shirt.name} (${data.color}, ${data.size})`);
    }

    console.log('\n--- Teste concluído com sucesso ---');
    console.log('Vá para o painel administrativo para ver o resumo de vendas dividido por cores.');
    process.exit(0);
  } catch (error) {
    console.error('Erro ao gerar dados de teste:', error);
    process.exit(1);
  }
}

seedTestData();
