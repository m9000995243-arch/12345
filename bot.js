const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== НАСТРОЙКИ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ХРАНИЛИЩЕ АКТИВНЫХ ЗАПРОСОВ =====
const activeRequests = new Map(); // userId -> {userName, chatId, history}

// ===== ИНФОРМАЦИЯ О БРЕНДЕ =====
const BRAND_INFO = {
  name: "Mortem Vellum",
  description: "концептуальная одежда с историей",
  delivery: "СДЭК, Почта России, Boxberry, Avito Доставка (2-5 дней)",
  phone: "+7 900 099 52 43",
  production: "ручное производство, шелкография",
  warranty: "7 дней на производственный брак",
  payment: "100% предоплата или 50% + наложенный платеж",
  returnPolicy: "возврат за наш счет при нашей ошибке"
};

// Клавиатура для пользователя
const userKeyboard = Markup.keyboard([
  ['👨‍💼 Позвать сотрудника']
]).resize();

// Клавиатура для админа (тебя)
const adminKeyboard = Markup.keyboard([
  ['✅ Ответить клиенту', '❌ Завершить диалог'],
  ['📞 Позвонить клиенту', '📋 История запросов']
]).resize();

// ===== УМНЫЕ ОТВЕТЫ =====
function getSmartResponse(question) {
  const lowerQuestion = question.toLowerCase();
  
  if (lowerQuestion.includes('привет') || lowerQuestion.includes('здравств')) {
    return `Привет! Я помощник бренда ${BRAND_INFO.name}. Чем могу помочь?`;
  }
  
  if (lowerQuestion.includes('достав') || lowerQuestion.includes('срок') || lowerQuestion.includes('получ')) {
    return `🚚 ${BRAND_INFO.delivery}\n\nМы отправляем заказы в течение 1-2 рабочих дней после оплаты.`;
  }
  
  if (lowerQuestion.includes('оплат') || lowerQuestion.includes('цена') || lowerQuestion.includes('стоим')) {
    return `💳 ${BRAND_INFO.payment}\n\nЦены от 1500 до 5000 рублей в зависимости от модели.`;
  }
  
  if (lowerQuestion.includes('гарант') || lowerQuestion.includes('возврат')) {
    return `🛡️ ${BRAND_INFO.warranty}\n\n${BRAND_INFO.returnPolicy}`;
  }
  
  if (lowerQuestion.includes('производств') || lowerQuestion.includes('качеств')) {
    return `🎨 ${BRAND_INFO.production}\n\nКаждая вещь создается вручную с вниманием к деталям.`;
  }
  
  if (lowerQuestion.includes('контакт') || lowerQuestion.includes('телефон')) {
    return `📞 ${BRAND_INFO.phone}\n\nЗвоните или пишите в WhatsApp/Telegram.`;
  }
  
  if (lowerQuestion.includes('бренд') || lowerQuestion.includes('mortem')) {
    return `🎭 ${BRAND_INFO.name} - это ${BRAND_INFO.description}.`;
  }
  
  if (lowerQuestion.includes('коллекц') || lowerQuestion.includes('одежд')) {
    return `👕 У нас есть худи, футболки и свитшоты с уникальными принтами.`;
  }
  
  if (lowerQuestion.includes('размер')) {
    return `📏 Есть размеры от S до XL. Рекомендуем ориентироваться на ваши стандартные размеры.`;
  }
  
  return `Расскажите подробнее о вашем вопросе. Или нажмите кнопку для связи с сотрудником 👇`;
}

// ===== КОМАНДА /start =====
bot.start((ctx) => {
  const userId = ctx.from.id;
  
  ctx.reply(
    `Привет! Я помощник бренда ${BRAND_INFO.name}. 🎭\n\nМогу помочь с доставкой, оплатой, размерами и другими вопросами.\n\nЗадайте вопрос или нажмите кнопку для связи с сотрудником 👇`,
    userKeyboard
  );
});

// ===== КОМАНДЫ ДЛЯ АДМИНА =====
bot.command('admin', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) {
    return ctx.reply('Эта команда только для администратора.');
  }
  
  const activeCount = activeRequests.size;
  ctx.reply(
    `👨‍💼 Панель администратора\n\nАктивные запросы: ${activeCount}\n\nИспользуйте кнопки ниже для управления:`,
    adminKeyboard
  );
});

// ===== ОБРАБОТКА СООБЩЕНИЙ ОТ ПОЛЬЗОВАТЕЛЕЙ =====
bot.on('text', async (ctx) => {
  const userText = ctx.message.text;
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'Пользователь';
  const chatId = ctx.chat.id;

  // Если это админ и есть активный диалог
  if (userId.toString() === ADMIN_CHAT_ID && userText.startsWith('/answer_')) {
    const targetUserId = userText.split('_')[1];
    const message = userText.split('_').slice(2).join('_');
    
    if (activeRequests.has(targetUserId)) {
      try {
        await bot.telegram.sendMessage(targetUserId, `👨‍💼 Ответ от сотрудника:\n\n${message}`, userKeyboard);
        await ctx.reply(`✅ Ответ отправлен пользователю`, adminKeyboard);
      } catch (error) {
        await ctx.reply('❌ Не удалось отправить сообщение. Пользователь, возможно, заблокировал бота.', adminKeyboard);
      }
    }
    return;
  }

  // Если админ отвечает через кнопку
  if (userId.toString() === ADMIN_CHAT_ID && activeRequests.size > 0) {
    if (userText === '📋 История запросов') {
      let requestsList = '📋 Активные запросы:\n\n';
      activeRequests.forEach((request, id) => {
        requestsList += `👤 ${request.userName} (ID: ${id})\n`;
        requestsList += `💬 История: ${request.history.length} сообщений\n`;
        requestsList += `⏰ Время: ${new Date().toLocaleTimeString()}\n`;
        requestsList += `📝 Ответить: `/answer_${id}_ваш_текст\n\n``;
      });
      await ctx.reply(requestsList, adminKeyboard);
      return;
    }
    
    if (userText === '❌ Завершить диалог') {
      // Здесь можно добавить логику завершения диалогов
      await ctx.reply('Выберите пользователя для завершения диалога:', adminKeyboard);
      return;
    }
    
    // Если админ пишет обычное сообщение без специальной команды
    if (!['✅ Ответить клиенту', '❌ Завершить диалог', '📞 Позвонить клиенту', '📋 История запросов'].includes(userText)) {
      await ctx.reply('Используйте кнопки ниже для управления запросами.', adminKeyboard);
    }
    return;
  }

  // Если пользователь нажал "Позвать сотрудника"
  if (userText === '👨‍💼 Позвать сотрудника') {
    // Сохраняем запрос
    if (!activeRequests.has(userId.toString())) {
      activeRequests.set(userId.toString(), {
        userName: userName,
        chatId: chatId,
        history: [],
        timestamp: Date.now()
      });
    }

    const request = activeRequests.get(userId.toString());
    
    // Отправляем уведомление админу
    const adminMessage = 
`🔔 НОВЫЙ ЗАПРОС ОТ КЛИЕНТА!

👤 Имя: ${userName}
🆔 ID: ${userId}
💬 Chat ID: ${chatId}
⏰ Время: ${new Date().toLocaleString('ru-RU')}

📝 Чтобы ответить, используйте:
`/answer_${userId}_ваш_текст`

Или нажмите "📋 История запросов" для просмотра всех активных запросов.`;

    try {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, adminKeyboard);
      await ctx.reply('✅ Сотрудник уже уведомлен! Он свяжется с вами в этом чате в ближайшее время.', userKeyboard);
    } catch (error) {
      await ctx.reply('📞 Позвоните нам: ' + BRAND_INFO.phone, userKeyboard);
    }
    return;
  }

  // Обычные сообщения от пользователей
  try {
    const response = getSmartResponse(userText);
    await ctx.reply(response, userKeyboard);
    
    // Сохраняем в историю если есть активный запрос
    if (activeRequests.has(userId.toString())) {
      const request = activeRequests.get(userId.toString());
      request.history.push({
        question: userText,
        answer: response,
        timestamp: Date.now()
      });
    }
    
  } catch (error) {
    await ctx.reply('📞 Для связи с сотрудником нажмите кнопку ниже или позвоните: ' + BRAND_INFO.phone, userKeyboard);
  }
});

// ===== ЗАПУСК БОТА =====
bot.launch().then(() => {
  console.log('🤖 Бот запущен!');
  console.log('👨‍💼 Команда для админ-панели: /admin');
}).catch((error) => {
  console.log('❌ Ошибка:', error.message);
});

app.get('/', (req, res) => {
  res.send('✅ Бот работает!');
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер на порту ${PORT}`);
});

