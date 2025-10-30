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

// ===== ХРАНИЛИЩЕ ДАННЫХ =====
const userSessions = new Map(); // userId -> {userName, history, isActive}
const adminState = new Map(); // adminId -> {currentAction, selectedUser}

// ===== ИНФОРМАЦИЯ О БРЕНДЕ =====
const BRAND_INFO = `
Ты - виртуальный помощник бренда концептуальной одежды "Mortem Vellum".
Отвечай ТОЛЬКО на вопросы о нашей продукции и услугах.

ИНФОРМАЦИЯ О БРЕНДЕ:
- Концептуальная одежда с уникальными принтами
- Доставка: СДЭК, Почта России, Boxberry (2-5 дней)
- Телефон: +7 900 099 52 43
- Производство: ручное, шелкография
- Гарантия: 7 дней на производственный брак
- Оплата: 100% предоплата или 50% + наложенный платеж
- Возврат за наш счет при нашей ошибке
- Размеры: S, M, L, XL
- Цены: от 1500 до 5000 рублей

Отвечай вежливо, кратко и по делу. Если вопрос не по теме - вежливо откажись отвечать.
`;

// ===== КЛАВИАТУРЫ =====
const userKeyboard = Markup.keyboard([['👨‍💼 Позвать сотрудника']]).resize();

const adminMainKeyboard = Markup.keyboard([
  ['📋 Список запросов', '💬 Ответить пользователю'],
  ['❌ Завершить диалог', '🔄 Обновить']
]).resize();

// ===== ФУНКЦИЯ НЕЙРОСЕТИ =====
async function askAI(question, userId) {
  try {
    // Сначала простые ответы для частых вопросов
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('достав')) {
      return '🚚 Доставка: СДЭК, Почта России, Boxberry (2-5 дней). Отправляем в течение 1-2 рабочих дней после оплаты.';
    }
    
    if (lowerQuestion.includes('оплат') || lowerQuestion.includes('цена')) {
      return '💳 Оплата: 100% предоплата картой или 50% + наложенный платеж. Цены от 1500 до 5000 рублей.';
    }
    
    if (lowerQuestion.includes('гарант') || lowerQuestion.includes('возврат')) {
      return '🛡️ Гарантия 7 дней на производственный брак. Возврат за наш счет при нашей ошибке.';
    }
    
    if (lowerQuestion.includes('размер')) {
      return '📏 Размеры: S, M, L, XL. Рекомендуем ориентироваться на ваши стандартные размеры.';
    }
    
    if (lowerQuestion.includes('привет') || lowerQuestion.includes('здравств')) {
      return 'Привет! Я помощник Mortem Vellum. Чем могу помочь?';
    }

    // Если нет простого ответа - используем нейросеть
    if (!HUGGING_FACE_TOKEN) {
      return 'Расскажите подробнее о вашем вопросе. Или нажмите кнопку для связи с сотрудником.';
    }

    const API_URL = "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium";
    const headers = { 
      "Authorization": `Bearer ${HUGGING_FACE_TOKEN}` 
    };

    const context = `${BRAND_INFO}\n\nВопрос: ${question}\nОтвет:`;
    
    const payload = {
      "inputs": context,
      "parameters": {
        "max_length": 200,
        "temperature": 0.7
      }
    };
    
    const response = await axios.post(API_URL, payload, { headers, timeout: 10000 });
    
    if (response.status === 200 && response.data && response.data[0]?.generated_text) {
      let answer = response.data[0].generated_text;
      
      // Очищаем ответ
      if (answer.includes('Ответ:')) {
        answer = answer.split('Ответ:')[1]?.trim() || answer;
      }
      
      return answer.slice(0, 400);
    }
    
    return 'Расскажите подробнее о вашем вопросе. Или нажмите кнопку для связи с сотрудником.';
    
  } catch (error) {
    console.log('Ошибка нейросети:', error.message);
    return 'Расскажите подробнее о вашем вопросе. Или нажмите кнопку для связи с сотрудником.';
  }
}

// ===== КОМАНДЫ ДЛЯ ПОЛЬЗОВАТЕЛЕЙ =====
bot.start((ctx) => {
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'Пользователь';
  
  // Создаем сессию пользователя
  userSessions.set(userId.toString(), {
    userName: userName,
    history: [],
    isActive: true,
    lastActivity: Date.now()
  });
  
  ctx.reply(
    `Привет! Я помощник бренда Mortem Vellum. 🎭\n\nЗадайте вопрос о нашей одежде, доставке или оплате, и я постараюсь помочь!\n\nЕсли нужна помощь сотрудника - нажмите кнопку ниже 👇`,
    userKeyboard
  );
});

// Обработка сообщений от пользователей
bot.on('text', async (ctx) => {
  const userText = ctx.message.text;
  const userId = ctx.from.id.toString();
  const userName = ctx.from.first_name || 'Пользователь';

  // Обновляем сессию
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      userName: userName,
      history: [],
      isActive: true,
      lastActivity: Date.now()
    });
  }

  const userSession = userSessions.get(userId);
  userSession.lastActivity = Date.now();

  // Если пользователь нажал "Позвать сотрудника"
  if (userText === '👨‍💼 Позвать сотрудника') {
    userSession.isActive = true; // Помечаем как активный запрос
    
    const adminMessage = 
`🔔 НОВЫЙ ЗАПРОС ОТ КЛИЕНТА!

👤 Имя: ${userSession.userName}
🆔 ID: ${userId}
⏰ Время: ${new Date().toLocaleString('ru-RU')}
💬 История: ${userSession.history.length} сообщений

Для ответа используйте команду:
/r_${userId} ваш текст

Или нажмите "💬 Ответить пользователю"`;

    try {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, adminMainKeyboard);
      await ctx.reply('✅ Сотрудник уведомлен! Он свяжется с вами в ближайшее время.', userKeyboard);
    } catch (error) {
      await ctx.reply('❌ Ошибка связи. Попробуйте позже.', userKeyboard);
    }
    return;
  }

  // Обычные сообщения - обрабатываем через нейросеть
  try {
    const response = await askAI(userText, userId);
    
    // Сохраняем в историю
    userSession.history.push({
      question: userText,
      answer: response,
      timestamp: Date.now(),
      fromAI: true
    });
    
    // Ограничиваем историю
    if (userSession.history.length > 10) {
      userSession.history = userSession.history.slice(-10);
    }
    
    await ctx.reply(response, userKeyboard);
    
  } catch (error) {
    await ctx.reply('Произошла ошибка. Попробуйте еще раз или нажмите кнопку для связи с сотрудником.', userKeyboard);
  }
});

// ===== КОМАНДЫ ДЛЯ АДМИНА =====

// Главная команда админа
bot.command('admin', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) {
    return ctx.reply('❌ Доступ запрещен');
  }
  
  showAdminPanel(ctx);
});

// Команда для быстрого ответа
bot.command('r_', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
  
  const commandText = ctx.message.text;
  const parts = commandText.split(' ');
  
  if (parts.length < 3) {
    return ctx.reply('Используйте: /r_ID_USER ваш текст ответа', adminMainKeyboard);
  }
  
  const userId = parts[0].replace('/r_', '');
  const message = parts.slice(1).join(' ');
  
  replyToUser(ctx, userId, message);
});

// Показ админ-панели
function showAdminPanel(ctx) {
  const activeUsers = Array.from(userSessions.entries())
    .filter(([id, session]) => session.isActive)
    .length;
  
  ctx.reply(
    `👨‍💼 Панель администратора\n\n` +
    `📊 Активных пользователей: ${activeUsers}\n` +
    `👥 Всего сессий: ${userSessions.size}\n\n` +
    `💡 Используйте кнопки ниже или команды:\n` +
    `/r_ID текст - быстрый ответ\n` +
    `/admin - обновить панель`,
    adminMainKeyboard
  );
}

// Функция ответа пользователю
async function replyToUser(ctx, userId, message) {
  if (!userSessions.has(userId)) {
    return ctx.reply('❌ Пользователь не найден', adminMainKeyboard);
  }
  
  const userSession = userSessions.get(userId);
  
  try {
    // Отправляем сообщение пользователю
    await bot.telegram.sendMessage(
      userId, 
      `👨‍💼 Ответ от сотрудника:\n\n${message}`,
      userKeyboard
    );
    
    // Сохраняем в историю
    userSession.history.push({
      question: 'Ответ сотрудника',
      answer: message,
      timestamp: Date.now(),
      fromAI: false
    });
    
    userSession.isActive = true;
    
    await ctx.reply(`✅ Ответ отправлен ${userSession.userName} (ID: ${userId})`, adminMainKeyboard);
    
  } catch (error) {
    await ctx.reply(`❌ Ошибка отправки для ${userId}. Пользователь заблокировал бота.`, adminMainKeyboard);
    userSessions.delete(userId); // Удаляем неактивного пользователя
  }
}

// ===== ОБРАБОТКА КНОПОК АДМИНА =====
bot.on('text', async (ctx) => {
  // Проверяем что сообщение от админа
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
  
  const text = ctx.message.text;
  
  // Кнопка "Список запросов"
  if (text === '📋 Список запросов') {
    const activeUsers = Array.from(userSessions.entries())
      .filter(([id, session]) => session.isActive);
    
    if (activeUsers.length === 0) {
      return ctx.reply('📭 Активных запросов нет', adminMainKeyboard);
    }
    
    let message = `📋 Активные запросы: ${activeUsers.length}\n\n`;
    
    activeUsers.forEach(([userId, session], index) => {
      message += `${index + 1}. 👤 ${session.userName}\n`;
      message += `   🆔 ${userId}\n`;
      message += `   💬 ${session.history.length} сообщений\n`;
      message += `   ⏰ ${new Date(session.lastActivity).toLocaleTimeString('ru-RU')}\n`;
      message += `   ✉️ Ответить: /r_${userId} ваш текст\n\n`;
    });
    
    message += '💡 Для ответа скопируйте ID и используйте команду /r_ID текст';
    
    await ctx.reply(message, adminMainKeyboard);
    return;
  }
  
  // Кнопка "Ответить пользователю"
  if (text === '💬 Ответить пользователю') {
    const activeUsers = Array.from(userSessions.entries())
      .filter(([id, session]) => session.isActive);
    
    if (activeUsers.length === 0) {
      return ctx.reply('📭 Нет активных пользователей для ответа', adminMainKeyboard);
    }
    
    // Сохраняем состояние админа
    adminState.set(ADMIN_CHAT_ID, { currentAction: 'waiting_user_select' });
    
    let message = `💬 Выберите пользователя для ответа:\n\n`;
    
    activeUsers.forEach(([userId, session], index) => {
      message += `${index + 1}. ${session.userName} (ID: ${userId})\n`;
    });
    
    message += `\n📝 Напишите номер пользователя (1, 2, 3...)`;
    
    await ctx.reply(message, Markup.keyboard([['↩️ Отмена']]).resize());
    return;
  }
  
  // Кнопка "Завершить диалог"
  if (text === '❌ Завершить диалог') {
    const activeUsers = Array.from(userSessions.entries())
      .filter(([id, session]) => session.isActive);
    
    if (activeUsers.length === 0) {
      return ctx.reply('📭 Нет активных диалогов для завершения', adminMainKeyboard);
    }
    
    adminState.set(ADMIN_CHAT_ID, { currentAction: 'waiting_end_dialog' });
    
    let message = `❌ Завершение диалога:\n\n`;
    
    activeUsers.forEach(([userId, session], index) => {
      message += `${index + 1}. ${session.userName} (ID: ${userId})\n`;
    });
    
    message += `\n📝 Напишите номер пользователя для завершения диалога`;
    
    await ctx.reply(message, Markup.keyboard([['↩️ Отмена']]).resize());
    return;
  }
  
  // Кнопка "Обновить"
  if (text === '🔄 Обновить') {
    showAdminPanel(ctx);
    return;
  }
  
  // Кнопка "Отмена"
  if (text === '↩️ Отмена') {
    adminState.delete(ADMIN_CHAT_ID);
    showAdminPanel(ctx);
    return;
  }
  
  // Обработка выбора пользователя для ответа
  const adminSession = adminState.get(ADMIN_CHAT_ID);
  if (adminSession) {
    if (adminSession.currentAction === 'waiting_user_select') {
      const userNumber = parseInt(text);
      const activeUsers = Array.from(userSessions.entries())
        .filter(([id, session]) => session.isActive);
      
      if (isNaN(userNumber) || userNumber < 1 || userNumber > activeUsers.length) {
        return ctx.reply('❌ Неверный номер. Выберите из списка:', Markup.keyboard([['↩️ Отмена']]).resize());
      }
      
      const [userId, userSession] = activeUsers[userNumber - 1];
      adminState.set(ADMIN_CHAT_ID, { 
        currentAction: 'waiting_reply_message', 
        selectedUser: userId 
      });
      
      let historyText = '📝 История диалога:\n\n';
      userSession.history.slice(-5).forEach((msg, index) => {
        const prefix = msg.fromAI ? '🤖' : '👤';
        historyText += `${prefix} ${msg.question}\n`;
        if (msg.answer) {
          historyText += `💡 ${msg.answer}\n\n`;
        }
      });
      
      await ctx.reply(
        `💬 Ответ для: ${userSession.userName} (ID: ${userId})\n\n${historyText}📝 Напишите ваш ответ:`,
        Markup.keyboard([['↩️ Отмена']]).resize()
      );
      return;
    }
    
    // Обработка сообщения для пользователя
    if (adminSession.currentAction === 'waiting_reply_message') {
      const userId = adminSession.selectedUser;
      await replyToUser(ctx, userId, text);
      adminState.delete(ADMIN_CHAT_ID);
      return;
    }
    
    // Обработка завершения диалога
    if (adminSession.currentAction === 'waiting_end_dialog') {
      const userNumber = parseInt(text);
      const activeUsers = Array.from(userSessions.entries())
        .filter(([id, session]) => session.isActive);
      
      if (isNaN(userNumber) || userNumber < 1 || userNumber > activeUsers.length) {
        return ctx.reply('❌ Неверный номер. Выберите из списка:', Markup.keyboard([['↩️ Отмена']]).resize());
      }
      
      const [userId, userSession] = activeUsers[userNumber - 1];
      userSession.isActive = false; // Деактивируем пользователя
      
      await ctx.reply(`✅ Диалог с ${userSession.userName} (ID: ${userId}) завершен`, adminMainKeyboard);
      adminState.delete(ADMIN_CHAT_ID);
      return;
    }
  }
  
  // Если админ пишет что-то без активного действия
  showAdminPanel(ctx);
});

// ===== ЗАПУСК =====
bot.launch().then(() => {
  console.log('🤖 Бот запущен!');
  console.log('👨‍💼 Команда админа: /admin');
}).catch((error) => {
  console.log('❌ Ошибка:', error.message);
});

app.get('/', (req, res) => {
  res.send('✅ Бот работает!');
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер на порту ${PORT}`);
});
