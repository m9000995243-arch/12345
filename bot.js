const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== НАСТРОЙКИ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ХРАНИЛИЩЕ =====
const userSessions = new Map(); // userId -> {userName, isWaitingForAdmin, history}
let adminState = { currentAction: null, selectedUser: null };

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

// ===== КЛАВИАТУРЫ =====
const userKeyboard = Markup.keyboard([['👨‍💼 Позвать сотрудника']]).resize();
const adminMainKeyboard = Markup.keyboard([
  ['📋 Список запросов', '💬 Ответить пользователю'],
  ['❌ Завершить диалог']
]).resize();

const adminCancelKeyboard = Markup.keyboard([['↩️ Отмена']]).resize();

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

// ===== ДЛЯ ПОЛЬЗОВАТЕЛЕЙ =====
bot.start((ctx) => {
  const userId = ctx.from.id.toString();
  const userName = ctx.from.first_name || 'Пользователь';
  
  // Создаем сессию пользователя
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      userName: userName,
      isWaitingForAdmin: false,
      history: []
    });
  }
  
  ctx.reply(
    `Привет! Я помощник бренда ${BRAND_INFO.name}. 🎭\n\nЗадайте вопрос или нажмите кнопку для связи с сотрудником 👇`,
    userKeyboard
  );
});

bot.on('text', async (ctx) => {
  const userText = ctx.message.text;
  const userId = ctx.from.id.toString();
  const userName = ctx.from.first_name || 'Пользователь';

  // Если пользователь нажал "Позвать сотрудника"
  if (userText === '👨‍💼 Позвать сотрудника') {
    // Создаем/обновляем сессию и помечаем что ждет ответа от админа
    userSessions.set(userId, {
      userName: userName,
      isWaitingForAdmin: true,
      history: []
    });

    const adminMessage = 
`🔔 НОВЫЙ ЗАПРОС ОТ КЛИЕНТА!

👤 Имя: ${userName}
🆔 ID: ${userId}
⏰ Время: ${new Date().toLocaleString('ru-RU')}

Пользователь ожидает вашего ответа!`;

    try {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, adminMainKeyboard);
      await ctx.reply('✅ Сотрудник уведомлен! Теперь все ваши сообщения будут переадресованы сотруднику. Ожидайте ответа.', userKeyboard);
    } catch (error) {
      await ctx.reply('❌ Ошибка связи. Попробуйте позже.', userKeyboard);
    }
    return;
  }

  // Если пользователь ожидает ответа от админа - пересылаем сообщение админу
  const userSession = userSessions.get(userId);
  if (userSession && userSession.isWaitingForAdmin) {
    const adminMessage = 
`📨 Сообщение от ${userName} (ID: ${userId}):

${userText}

💬 Ответьте через кнопку "💬 Ответить пользователю"`;

    try {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, adminMainKeyboard);
      await ctx.reply('✅ Сообщение передано сотруднику. Ожидайте ответа.', userKeyboard);
    } catch (error) {
      await ctx.reply('❌ Ошибка отправки.', userKeyboard);
    }
    return;
  }

  // Обычные сообщения - отвечаем через умные ответы
  try {
    const response = getSmartResponse(userText);
    await ctx.reply(response, userKeyboard);
    
  } catch (error) {
    await ctx.reply('Произошла ошибка. Попробуйте еще раз.', userKeyboard);
  }
});

// ===== ДЛЯ АДМИНА =====

// Команда /admin
bot.command('admin', (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) {
    return ctx.reply('❌ Доступ запрещен');
  }
  
  showAdminPanel(ctx);
});

// Функция показа админ-панели
function showAdminPanel(ctx) {
  const waitingUsers = Array.from(userSessions.entries())
    .filter(([id, session]) => session.isWaitingForAdmin);
  
  let message = `👨‍💼 Панель администратора\n\n`;
  message += `⏳ Ожидают ответа: ${waitingUsers.length}\n`;
  message += `👥 Всего пользователей: ${userSessions.size}\n\n`;
  
  if (waitingUsers.length > 0) {
    message += `📋 Пользователи ожидающие ответа:\n`;
    waitingUsers.forEach(([userId, session], index) => {
      message += `${index + 1}. ${session.userName} (ID: ${userId})\n`;
    });
  } else {
    message += `📭 Нет активных запросов`;
  }
  
  ctx.reply(message, adminMainKeyboard);
  adminState = { currentAction: null, selectedUser: null };
}

// Обработка кнопок админа
bot.on('text', async (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
  
  const text = ctx.message.text;
  
  // Кнопка "Список запросов"
  if (text === '📋 Список запросов') {
    showAdminPanel(ctx);
    return;
  }
  
  // Кнопка "Ответить пользователю"
  if (text === '💬 Ответить пользователю') {
    const waitingUsers = Array.from(userSessions.entries())
      .filter(([id, session]) => session.isWaitingForAdmin);
    
    if (waitingUsers.length === 0) {
      return ctx.reply('📭 Нет пользователей ожидающих ответа', adminMainKeyboard);
    }
    
    adminState.currentAction = 'select_user_for_reply';
    
    let message = `💬 Выберите пользователя для ответа:\n\n`;
    waitingUsers.forEach(([userId, session], index) => {
      message += `${index + 1}. ${session.userName} (ID: ${userId})\n`;
    });
    
    message += `\n📝 Напишите номер пользователя (1, 2, 3...)`;
    
    await ctx.reply(message, adminCancelKeyboard);
    return;
  }
  
  // Кнопка "Завершить диалог"
  if (text === '❌ Завершить диалог') {
    const waitingUsers = Array.from(userSessions.entries())
      .filter(([id, session]) => session.isWaitingForAdmin);
    
    if (waitingUsers.length === 0) {
      return ctx.reply('📭 Нет активных диалогов для завершения', adminMainKeyboard);
    }
    
    adminState.currentAction = 'select_user_for_end';
    
    let message = `❌ Завершение диалога:\n\n`;
    waitingUsers.forEach(([userId, session], index) => {
      message += `${index + 1}. ${session.userName} (ID: ${userId})\n`;
    });
    
    message += `\n📝 Напишите номер пользователя для завершения диалога`;
    
    await ctx.reply(message, adminCancelKeyboard);
    return;
  }
  
  // Кнопка "Отмена"
  if (text === '↩️ Отмена') {
    adminState = { currentAction: null, selectedUser: null };
    showAdminPanel(ctx);
    return;
  }
  
  // Обработка выбора пользователя для ответа
  if (adminState.currentAction === 'select_user_for_reply') {
    const userNumber = parseInt(text);
    const waitingUsers = Array.from(userSessions.entries())
      .filter(([id, session]) => session.isWaitingForAdmin);
    
    if (isNaN(userNumber) || userNumber < 1 || userNumber > waitingUsers.length) {
      return ctx.reply('❌ Неверный номер. Выберите из списка:', adminCancelKeyboard);
    }
    
    const [userId, userSession] = waitingUsers[userNumber - 1];
    adminState = { 
      currentAction: 'waiting_reply_message', 
      selectedUser: userId 
    };
    
    await ctx.reply(
      `💬 Ответ для: ${userSession.userName} (ID: ${userId})\n\n📝 Напишите ваш ответ:`,
      adminCancelKeyboard
    );
    return;
  }
  
  // Обработка сообщения для пользователя
  if (adminState.currentAction === 'waiting_reply_message') {
    const userId = adminState.selectedUser;
    
    if (!userSessions.has(userId)) {
      adminState = { currentAction: null, selectedUser: null };
      return ctx.reply('❌ Пользователь больше не активен', adminMainKeyboard);
    }
    
    const userSession = userSessions.get(userId);
    
    try {
      // Отправляем сообщение пользователю
      await bot.telegram.sendMessage(
        userId, 
        `👨‍💼 Ответ от сотрудника:\n\n${text}`,
        userKeyboard
      );
      
      await ctx.reply(`✅ Ответ отправлен ${userSession.userName}`, adminMainKeyboard);
      
    } catch (error) {
      await ctx.reply(`❌ Ошибка отправки. Пользователь заблокировал бота.`, adminMainKeyboard);
      userSessions.delete(userId); // Удаляем неактивного пользователя
    }
    
    adminState = { currentAction: null, selectedUser: null };
    return;
  }
  
  // Обработка завершения диалога
  if (adminState.currentAction === 'select_user_for_end') {
    const userNumber = parseInt(text);
    const waitingUsers = Array.from(userSessions.entries())
      .filter(([id, session]) => session.isWaitingForAdmin);
    
    if (isNaN(userNumber) || userNumber < 1 || userNumber > waitingUsers.length) {
      return ctx.reply('❌ Неверный номер. Выберите из списка:', adminCancelKeyboard);
    }
    
    const [userId, userSession] = waitingUsers[userNumber - 1];
    
    // Отправляем уведомление пользователю
    try {
      await bot.telegram.sendMessage(
        userId, 
        '💬 Диалог с сотрудником завершен. Если у вас есть еще вопросы - нажмите кнопку "👨‍💼 Позвать сотрудника"',
        userKeyboard
      );
    } catch (error) {
      // Игнорируем ошибку если пользователь заблокировал бота
    }
    
    // Удаляем пользователя из ожидающих
    userSessions.delete(userId);
    
    await ctx.reply(`✅ Диалог с ${userSession.userName} завершен`, adminMainKeyboard);
    adminState = { currentAction: null, selectedUser: null };
    return;
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
