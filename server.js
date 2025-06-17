// backend/server.js
const express = require('express');
const cors = require('cors');
const os = require('os'); // Para descobrir o IP automaticamente
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3001;

// Função para descobrir o IP da máquina
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (
        alias.family === 'IPv4' &&
        !alias.internal &&
        (alias.address.startsWith('192.168.') || alias.address.startsWith('10.'))
      ) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}


// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'stripe-signature']
}));

// Log de todas as requisições
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log(`📍 IP do cliente: ${req.ip}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 Body:`, JSON.stringify(req.body, null, 2));
  }
  next();
});

app.use(express.json());

// Endpoint de teste - MUITO IMPORTANTE
app.get('/health', (req, res) => {
  console.log('✅ Health check chamado');
  res.json({ 
    status: 'OK', 
    message: 'Servidor Stripe funcionando!',
    timestamp: new Date().toISOString(),
    ip: getLocalIP()
  });
});

// Endpoint para criar Payment Intent
app.post('/create-payment-intent', async (req, res) => {
  try {
    console.log('🔄 Criando Payment Intent...');
    const { amount, currency = 'usd', metadata = {} } = req.body;

    // Validações básicas
    if (!amount || amount <= 0) {
      console.log('❌ Valor inválido:', amount);
      return res.status(400).json({
        error: 'Valor inválido',
        message: 'O valor deve ser maior que zero'
      });
    }

    console.log(`💰 Valor: ${amount} centavos (R$ ${amount/100})`);
    console.log(`🌍 Moeda: ${currency}`);
    console.log(`📋 Metadata:`, metadata);

    // Verificar se a chave do Stripe está configurada
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log('❌ STRIPE_SECRET_KEY não configurada');
      return res.status(500).json({
        error: 'Configuração inválida',
        message: 'Chave do Stripe não configurada'
      });
    }

    // Criar Payment Intent no Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: metadata,
    });

    console.log(`✅ Payment Intent criado: ${paymentIntent.id}`);

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });

  } catch (error) {
    console.error('❌ Erro ao criar Payment Intent:', error.message);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      error: 'Erro interno do servidor',
      message: error.message
    });
  }
});

// Endpoint para confirmar pagamento (webhook)
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`❌ Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log(`✅ Pagamento bem-sucedido: ${paymentIntent.id}`);
      break;
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log(`❌ Pagamento falhou: ${failedPayment.id}`);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Descobrir e mostrar o IP automaticamente
const localIP = getLocalIP();

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀'.repeat(50));
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🔗 Acesso local: http://localhost:${PORT}`);
  console.log(`📱 Acesso celular: http://${localIP}:${PORT}`);
  console.log(`🧪 Teste de saúde: http://${localIP}:${PORT}/health`);
  console.log('🚀'.repeat(50));
  console.log(`⚠️  USE ESTE IP NO SEU APP FLUTTER: http://${localIP}:${PORT}`);
  console.log('🚀'.repeat(50));
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.log('Uncaught Exception:', error);
  process.exit(1);
});