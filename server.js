const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const os = require('os');
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Função otimizada para detectar IP da rede Wi-Fi física (sem VPNs/VMs)
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  
  // Lista de interfaces/IPs para ignorar
  const ignorePatterns = [
    'vmware',
    'virtualbox', 
    'wintun',
    'radmin',
    'vpn',
    'teredo',
    'loopback'
  ];
  
  const ignoreIPs = [
    '169.254.', // Auto-configuração
    '26.',      // Radmin VPN
    '192.168.56.' // VirtualBox
  ];
  
  const candidates = [];
  
  for (const [name, addrs] of Object.entries(interfaces)) {
    // Ignora interfaces virtuais pelo nome
    if (ignorePatterns.some(pattern => name.toLowerCase().includes(pattern))) {
      continue;
    }
    
    for (const addr of addrs) {
      if (
        addr.family === 'IPv4' &&
        !addr.internal &&
        !ignoreIPs.some(ip => addr.address.startsWith(ip))
      ) {
        // Prioridade alta para sua rede específica
        const isMainNetwork = addr.address.startsWith('192.168.0.');
        const isEthernet = name.toLowerCase().includes('ethernet');
        
        candidates.push({
          name,
          address: addr.address,
          priority: isMainNetwork ? 10 : (isEthernet ? 5 : 1)
        });
      }
    }
  }
  
  // Ordena por prioridade (maior primeiro)
  candidates.sort((a, b) => b.priority - a.priority);
  
  if (candidates.length > 0) {
    const selected = candidates[0];
    console.log(`🌐 IP detectado: ${selected.address} (${selected.name})`);
    return selected.address;
  }
  
  console.log('⚠️ IP físico não encontrado, usando localhost');
  return 'localhost';
}

const localIP = getLocalIP();

// ✅ Middlewares
app.use(helmet());

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://SEU_DOMINIO.com']
    : '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'stripe-signature']
}));

app.use(express.json());

// ✅ Logs simples
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ✅ Rota principal
app.get('/', (req, res) => {
  res.send(`
    <h2>🚀 Stripe API Backend</h2>
    <p>Status: Online</p>
    <p><strong>IP Detectado:</strong> ${localIP}</p>
    <ul>
      <li><strong>POST</strong> /create-payment-intent</li>
      <li><strong>GET</strong> /health</li>
    </ul>
  `);
});

// ✅ Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    ip: localIP,
    environment: process.env.NODE_ENV || 'development'
  });
});

// ✅ Criar Payment Intent
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'brl', metadata = {} } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: 'Valor inválido',
        message: 'O valor deve ser maior que zero'
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata
    });

    res.json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id
    });
  } catch (error) {
    console.error('❌ Erro ao criar Payment Intent:', error);
    res.status(500).json({
      error: 'Erro interno',
      message: error.message
    });
  }
});

// ✅ Webhook do Stripe
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('❌ Webhook Error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      console.log('✅ Pagamento bem-sucedido:', event.data.object.id);
      break;
    case 'payment_intent.payment_failed':
      console.log('❌ Pagamento falhou:', event.data.object.id);
      break;
    default:
      console.log(`ℹ️ Evento ignorado: ${event.type}`);
  }

  res.json({ received: true });
});

// ✅ Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Stripe API Rodando');
  console.log(`📍 Localhost: http://localhost:${PORT}`);
  console.log(`📱 Dispositivo: http://${localIP}:${PORT}`);
  console.log(`✅ Teste no navegador: http://${localIP}:${PORT}/health`);
  console.log(`🔍 Debug - Todas as interfaces de rede:`);
  
  // Debug: mostra todas as interfaces para verificação
  const interfaces = os.networkInterfaces();
  Object.entries(interfaces).forEach(([name, addrs]) => {
    addrs.forEach(addr => {
      if (addr.family === 'IPv4' && !addr.internal) {
        console.log(`   ${name}: ${addr.address}`);
      }
    });
  });
});
