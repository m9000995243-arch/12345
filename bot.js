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
let selectedUserForReply = null; // Для хранения выбранного пользователя

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
  ['📋 Список запросов'],
  ['🔄 Обновить список']
]).resize();

const replyKeyboard = Markup.keyboard([
  ['↩️ Назад к списку'],
  ['❌ Завершить диалог']
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
  
  showRequestsList(ctx);
});

// ===== ПОКАЗАТЬ СПИСОК ЗАПРОСОВ =====
function showRequestsList(ctx) {
  const activeCount = activeRequests.size;
  
  if (activeCount === 0) {
    return ctx.reply(
      '📭 Активных запросов нет\n\nНажмите "🔄 Обновить список" для проверки новых запросов.',
      adminKeyboard
    );
  }
  
  let requestsList = `📋 Активные запросы: ${activeCount}\n\n`;
  let counter = 1;
  
  activeRequests.forEach((request, userId) => {
    requestsList += `${counter}. 👤 ${request.userName}\n`;
    requestsList += `   🆔 ID: \`${userId}\`\n`;
    requestsList += `   💬 Сообщений: ${request.history.length}\n`;
    requestsList += `   ⏰ Запрос: ${new Date(request.timestamp).toLocaleTimeString('ru-RU')}\n`;
    requestsList += `   ✉️ Ответить: /reply_${userId}\n\n`;
    counter++;
  });
  
  requestsList += '💡 Чтобы ответить, нажмите на команду /reply_ID выше или используйте кнопки';
  
  ctx.reply(requestsList, {
    parse_mode: 'Markdown',
    ...adminKeyboard
  });
}

// ===== ОБРАБОТКА КНОПОК АДМИНА =====
bot.action(/reply_(.+)/, async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
  
  const userId = ctx.match[1];
  if (activeRequests.has(userId)) {
    selectedUserForReply = userId;
    const request = activeRequests.get(userId);
    
    let historyText = '📝 История диалога:\n\n';
    request.history.forEach((msg, index) => {
      historyText += `${index + 1}. ❓ ${msg.question}\n`;
      historyText += `   💡 ${msg.answer}\n\n`;
    });
    
    await ctx.reply(
      `💬 Диалог с: ${request.userName}\n🆔 ID: \`${userId}\`\n\n${historyText}\n📝 Напишите сообщение для ответа:`,
      { 
        parse_mode: 'Markdown',
        ...replyKeyboard 
      }
    );
    
    await ctx.answerCbQuery();
  }
});

// ===== ОБРАБОТКА СООБЩЕНИЙ ОТ ПОЛЬЗОВАТЕЛЕЙ =====
bot.on('text', async (ctx) => {
  const userText = ctx.message.text;
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'Пользователь';
  const chatId = ctx.chat.id;

  // === СООБЩЕНИЯ ОТ АДМИНА ===
  if (userId.toString() === ADMIN_CHAT_ID) {
    
    // Кнопка "Список запросов"
    if (userText === '📋 Список запросов' || userText === '🔄 Обновить список') {
      showRequestsList(ctx);
      return;
    }
    
    // Кнопка "Назад к списку"
    if (userText === '↩️ Назад к списку') {
      selectedUserForReply = null;
      showRequestsList(ctx);
      return;
    }
    
    // Кнопка "Завершить диалог"
    if (userText === '❌ Завершить диалог' && selectedUserForReply) {
      if (activeRequests.has(selectedUserForReply)) {
        const userName = activeRequests.get(selectedUserForReply).userName;
        activeRequests.delete(selectedUserForReply);
        selectedUserForReply = null;
        
        await ctx.reply(`✅ Диалог с ${userName} завершен`, adminKeyboard);
        showRequestsList(ctx);
      }
      return;
    }
    
    // Ответ пользователю (если выбран пользователь)
    if (selectedUserForReply && activeRequests.has(selectedUserForReply)) {
      const request = activeRequests.get(selectedUserForReply);
      
      try {
        // Отправляем сообщение пользователю
        await bot.telegram.sendMessage(
          selectedUserForReply, 
          `👨‍💼 Ответ от сотрудника:\n\n${userText}`,
          userKeyboard
        );
        
        // Сохраняем в историю
        request.history.push({
          question: `Ответ сотрудника`,
          answer: userText,
          timestamp: Date.now()
        });
        
        await ctx.reply(`✅ Ответ отправлен ${request.userName}`, replyKeyboard);
        
      } catch (error) {
        await ctx.reply('❌ Не удалось отправить сообщение. Пользователь, возможно, заблокировал бота.', replyKeyboard);
      }
      return;
    }
    
    // Если админ пишет что-то без выбранного пользователя
    if (!selectedUserForReply) {
      await ctx.reply('Используйте кнопки ниже для управления запросами.', adminKeyboard);
    }
    return;
  }

  // === СООБЩЕНИЯ ОТ ОБЫЧНЫХ ПОЛЬЗОВАТЕЛЕЙ ===
  
  // Если пользователь нажал "Позвать сотрудника"
  if (userText === '👨‍💼 Позвать сотрудника') {
    // Сохраняем запрос
    activeRequests.set(userId.toString(), {
      userName: userName,
      chatId: chatId,
      history: [],
      timestamp: Date.now()
    });

    // Отправляем уведомление админу
    const adminMessage = 
`🔔 НОВЫЙ ЗАПРОС ОТ КЛИЕНТА!

👤 Имя: ${userName}
🆔 ID: \`${userId}\`
⏰ Время: ${new Date().toLocaleString('ru-RU')}

💡 ID скопирован для ответа! Используйте кнопку "📋 Список запросов"`;

    try {
      await bot.telegram.sendMessage(
        ADMIN_CHAT_ID, 
        adminMessage, 
        { 
          parse_mode: 'Markdown',
          ...adminKeyboard 
        }
      );
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
