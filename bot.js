require('dotenv').config();
const TelegramBot   = require('node-telegram-bot-api');
const moment        = require('moment');
const { Low, JSONFile } = require('lowdb');
const fs            = require('fs');

const token = process.env.BOT_TOKEN;
const bot   = new TelegramBot(token, { polling: true });

/* ----------  Persistencia simple  ---------- */
const adapter = new JSONFile('db.json');
const db      = new Low(adapter);

(async () => {
  await db.read();
  db.data ||= { products: [], orders: [], production: [] };
  await db.write();
})();

/* ----------  Datos de ejemplo  ---------- */
(async () => {
  await db.read();
  if (db.data.products.length === 0) {
    db.data.products = [
      { id: 1, name: 'Croquetas de pollo',      category: 'Croquetas', stock: 50, price: 8 },
      { id: 2, name: 'Croquetas de res',        category: 'Croquetas', stock: 30, price: 9 },
      { id: 3, name: 'Natilla vainilla',        category: 'Natillas',  stock: 60, price: 3 },
      { id: 4, name: 'Natilla chocolate',       category: 'Natillas',  stock: 40, price: 3 },
      { id: 5, name: 'Snack mix',               category: 'Otros',     stock: 20, price: 2 }
    ];
    await db.write();
  }
})();

/* ----------  Helpers  ---------- */
const OWNER_ID = process.env.OWNER_ID || 123456789; // poner tu propio user-id

/* ----------  Dashboard principal  ---------- */
bot.onText(/\/start/, async (msg) => {
  if (msg.from.id !== OWNER_ID) {
    return bot.sendMessage(msg.chat.id, 'Hola, soy la tienda oficial 🛍️');
  }

  const monthStart = moment().startOf('month').valueOf();
  const ordersThisMonth = db.data.orders.filter(o => o.date >= monthStart);
  const salesQty = ordersThisMonth.reduce((s, o) => s + o.qty, 0);
  const earnings = ordersThisMonth.reduce((s, o) => s + o.total, 0);

  const opts = {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📦 Catálogo',         callback_data: 'menu_catalogo' }],
        [{ text: '📋 Pedidos',         callback_data: 'menu_pedidos' }],
        [{ text: '👤 Contactos',       callback_data: 'menu_contactos' }],
        [{ text: '🔄 Actualizar stock', callback_data: 'menu_stock' }],
        [{ text: '📈 Producción 7d',   callback_data: 'menu_production' }]
      ]
    }
  };

  bot.sendMessage(
    msg.chat.id,
    `*¡Bienvenido @${msg.from.username || msg.from.first_name}!*\n\n` +
    `💰 *Ventas mes:* ${salesQty} unidades\n` +
    `💵 *Ganancias mes:* $${earnings.toFixed(2)}`,
    opts
  );
});

/* ----------  Callback queries  ---------- */
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id;
  const data   = q.data;
  await bot.answerCallbackQuery(q.id);

  switch (data) {
    /* ------------- Catálogo ------------- */
    case 'menu_catalogo':
      const grouped = {};
      db.data.products.forEach(p => {
        grouped[p.category] ||= [];
        grouped[p.category].push(p);
      });
      let text = '*Catálogo*\n\n';
      ['Croquetas','Natillas','Otros'].forEach(cat => {
        text += `*${cat}*\n`;
        (grouped[cat] || []).forEach(p =>
          text += `• ${p.name} – $${p.price} (Stock: ${p.stock})\n`
        );
        text += '\n';
      });
      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
      break;

    /* ------------- Pedidos ------------- */
    case 'menu_pedidos':
      const last = db.data.orders.slice(-10).reverse();
      let pedidosText = '*Últimos pedidos:*\n';
      last.forEach(o =>
        pedidosText += `• ${o.name} – ${o.qty} u – $${o.total} – ${moment(o.date).format('DD/MM HH:mm')}\n`
      );
      bot.sendMessage(chatId, pedidosText, { parse_mode: 'Markdown' });
      break;

    /* ------------- Contactos ------------- */
    case 'menu_contactos':
      const contacts = db.data.orders.map(o => o.user).filter((v,i,a)=>a.findIndex(t=>(t.id === v.id))===i);
      let contactsText = '*Contactos:*\n';
      contacts.forEach(u =>
        contactsText += `• ${u.first_name || ''} ${u.last_name || ''} – ${u.phone || 'Sin teléfono'}\n`
      );
      bot.sendMessage(chatId, contactsText, { parse_mode: 'Markdown' });
      break;

    /* ------------- Stock ------------- */
    case 'menu_stock':
      let stockText = '*Actualizar stock:*\nEnvía /stock <id> <cantidad>\nEj: `/stock 1 20`';
      bot.sendMessage(chatId, stockText, { parse_mode: 'Markdown' });
      break;

    /* ------------- Producción ------------- */
    case 'menu_production':
      const since = moment().subtract(7,'days').valueOf();
      const prod = db.data.production.filter(p => p.date >= since);
      let prodText = '*Producción últimos 7 días:*\n';
      prod.forEach(p =>
        prodText += `• ${p.item} – ${p.qty} u – ${moment(p.date).format('DD/MM')}\n`
      );
      bot.sendMessage(chatId, prodText, { parse_mode: 'Markdown' });
      break;
  }
});

/* ----------  Comando /stock ---------- */
bot.onText(/\/stock (\d+) (\d+)/, async (msg, match) => {
  if (msg.from.id !== OWNER_ID) return;
  const id = parseInt(match[1]);
  const qty = parseInt(match[2]);
  const prod = db.data.products.find(p => p.id === id);
  if (!prod) return bot.sendMessage(msg.chat.id, 'ID inválido');
  prod.stock += qty;
  await db.write();
  bot.sendMessage(msg.chat.id, `✅ Stock actualizado: ${prod.name} → ${prod.stock} u`);
});

/* ----------  Dummy de compra (para pruebas) ---------- */
bot.onText(/\/compra (\d+) (\d+)/, async (msg, match) => {
  const id   = parseInt(match[1]);
  const qty  = parseInt(match[2]);
  const prod = db.data.products.find(p => p.id === id);
  if (!prod) return bot.sendMessage(msg.chat.id, 'Producto no encontrado');
  if (prod.stock < qty)   return bot.sendMessage(msg.chat.id, 'No hay suficiente stock');

  db.data.orders.push({
    name: prod.name,
    qty,
    total: qty * prod.price,
    date: Date.now(),
    user: msg.from
  });
  prod.stock -= qty;
  await db.write();
  bot.sendMessage(msg.chat.id, `✅ Compra registrada: ${qty} × ${prod.name}`);
});

console.log('Bot iniciado en Railway con dashboard');
