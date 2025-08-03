require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.BOT_TOKEN;
const bot   = new TelegramBot(token, { polling: true });

const products = [
  { id: 1, name: 'Remera Logo', price: 15, desc: '100 % algodón' },
  { id: 2, name: 'Taza',        price: 8,  desc: 'Cerámica 300 ml' }
];

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    '¡Hola! Soy *Mi Tienda* 🛍️\nEscribe /productos para ver lo que vendemos.',
    { parse_mode: 'Markdown' });
});

bot.onText(/\/productos/, (msg) => {
  let txt = '*Productos disponibles:*\n\n';
  products.forEach(p => {
    txt += `*${p.id}.* ${p.name} – $${p.price}\n${p.desc}\n\n`;
  });
  txt += 'Para comprar envía /comprar <número>';
  bot.sendMessage(msg.chat.id, txt, { parse_mode: 'Markdown' });
});

bot.onText(/\/comprar (\d+)/, (msg, match) => {
  const id = parseInt(match[1]);
  const prod = products.find(p => p.id === id);
  if (!prod) return bot.sendMessage(msg.chat.id, 'Producto inválido');
  bot.sendMessage(msg.chat.id,
    `✅ Pedido registrado:\n${prod.name} – $${prod.price}\n\nTe contactaremos por privado.`);
});

console.log('Bot corriendo en Railway');
