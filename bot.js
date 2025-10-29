const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== ИСПОЛЬЗУЕМ ПЕРЕМЕННЫЕ ОКРУЖЕНИЯ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

console.log('🔧 Проверка токена:', TELEGRAM_BOT_TOKEN ? 'Токен есть' : 'Токена нет!');

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
const keyboard = Markup.keyboard([['👨‍💼 Позвать сотрудника']]).resize();

// Простые команды для теста
bot.start((ctx) => {
  console.log('✅ Получена команда /start');
  ctx.reply(
    'Привет! Я помощник Mortem Vellum. Бот работает! Задайте вопрос или нажмите кнопку.',
    keyboard
  );
});

bot.help((ctx) => {
  ctx.reply('Это тестовый бот. Напишите что-нибудь или нажмите кнопку.');
});

bot.on('text', async (ctx) => {
  const userText = ctx.message.text;
  console.log('📨 Получено сообщение:', userText);

  if (userText === '👨‍💼 Позвать сотрудника') {
    await ctx.reply('Тест: Кнопка работает! Сотрудник уведомлен.', keyboard);
    return;
  }

  await ctx.reply(`Вы написали: "${userText}". Бот работает корректно!`, keyboard);
});

// Обработка ошибок
bot.catch((err, ctx) => {
  console.log('❌ Ошибка бота:', err);
});

// Запуск бота с проверкой
if (!TELEGRAM_BOT_TOKEN) {
  console.log('❌ КРИТИЧЕСКАЯ ОШИБКА: TELEGRAM_BOT_TOKEN не установлен!');
  process.exit(1);
}

bot.launch().then(() => {
  console.log('🤖 Бот успешно запущен!');
  console.log('✅ Токен корректный!');
}).catch((error) => {
  console.log('❌ Ошибка запуска бота:', error.message);
  console.log('🔧 Проверь токен в Environment Variables');
});

// Простой сервер для Render
app.get('/', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>✅ Бот Mortem Vellum работает!</h1>
        <p>Токен: ${TELEGRAM_BOT_TOKEN ? 'установлен' : 'ОШИБКА: не установлен'}</p>
        <p>Статус: Активен</p>
      </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
