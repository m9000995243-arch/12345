javascript
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== НАСТРОЙКИ =====
// ВСТАВЬ СЮДА СВОЙ ТОКЕН ОТ BOTFATHER
const TELEGRAM_BOT_TOKEN = "8125387296:AAHK5-dz0x84jUyu5NpqQM65RQrw6tX5E";

// ВСТАВЬ СЮДА СВОЙ ТОКЕН ОТ HUGGING FACE
const HUGGING_FACE_TOKEN = "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";

// ВСТАВЬ СЮДА СВОЙ ID ИЗ @userinfobot (ТОЛЬКО ЦИФРЫ)
const ADMIN_CHAT_ID = 1210191057; // ЗАМЕНИ НА СВОЙ ID

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ИНФОРМАЦИЯ О ТВОЁМ БРЕНДЕ =====
const BRAND_INFO = `
Ты - виртуальный помощник службы поддержки бренда "Mortem Vellum".
Отвечай ТОЛЬКО на вопросы, связанные с нашей продукцией и услугами.
Если вопрос не по теме, вежливо откажись отвечать.

ИНФОРМАЦИЯ О БРЕНДЕ:

- Мы продаём концептуальную и модную одежду с историей создания
- Доставка по России такими компаниями как СДЕК/Почта России/Boxberry/Avito Доставка/
- Телефон поддержки: +7 900 099 52 43
- Мы производим одежду вручную. принты наносим с помощью шелкографии.
- Доставка во все регионы России
- Гарантия 7 дней с момента получения товара.(распространяется только на производственный брак. порванная вещь по неосторожности клиента является невозвратной)
- Возврат осуществляется за наш счет, если вещь неправильная по нашей ошибке.
- Обмен идеями: пришли свою концепцию - получи скидку 20%
в случае первого недопонимания с клиентом, попроси его нажать кнопку позвать сотрудника.
- оплата производится в день покупки товара либо по 50 процентной предоплате и наложенным платежом после получения, который клиент обязан будет оплатить.

Помни: ты представляешь премиальный бренд, будь вежлив, краток и концептуален в ответах.
`;

// Создаём клавиатуру с кнопкой
const keyboard = Markup.keyboard([
  ['👨‍💼 Позвать сотрудника']
]).resize();

// ===== ФУНКЦИЯ ДЛЯ ЗАПРОСА К БЕСПЛАТНОЙ НЕЙРОСЕТИ =====
async function askAI(question) {
  try {
    const API_URL = "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium";
    const headers = { 
      "Authorization": `Bearer ${HUGGING_FACE_TOKEN}` 
    };

    // Собираем контекст для нейросети
    const context = `${BRAND_INFO}\n\nВопрос: ${question}\nОтвет:`;
    
    const payload = {
      "inputs": context,
      "parameters": {
        "max_length": 250,
        "temperature": 0.7,
        "do_sample": true
      }
    };
    
    const response = await axios.post(API_URL, payload, { headers });
    
    if (response.status === 200) {
      const result = response.data;
      if (Array.isArray(result) && result.length > 0) {
        let answer = result[0].generated_text || 'Извините, не могу обработать вопрос сейчас.';
        
        // Очищаем ответ от лишнего
        if (answer.includes('Ответ:')) {
          answer = answer.split('Ответ:')[1]?.trim() || answer;
        }
        
        // Ограничиваем длину
        return answer.slice(0, 400);
      }
    }
    return "Сервис временно недоступен. Пожалуйста, попробуйте позже или нажмите 'Позвать сотрудника'.";
    
  } catch (error) {
    console.log('Ошибка AI:', error.message);
    return "Произошла ошибка. Пожалуйста, нажмите 'Позвать сотрудника' для связи с человеком.";
  }
}

// ===== ХРАНИЛИЩЕ ИСТОРИИ ЧАТОВ =====
const userHistory = new Map();

// ===== КОМАНДА /start =====
bot.start((ctx) => {
  const userId = ctx.from.id;
  // Инициализируем историю для пользователя
  userHistory.set(userId, []);
  
  ctx.reply(
    'Привет! Я виртуальный помощник. Задайте ваш вопрос по нашей продукции, и я постараюсь помочь. ' +
    'Если вам нужна помощь живого сотрудника, нажмите кнопку ниже.',
    keyboard
  );
});

// ===== ОБРАБОТКА ОБЫЧНЫХ СООБЩЕНИЙ =====
bot.on('text', async (ctx) => {
  const userText = ctx.message.text;
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'Пользователь';

  // Если пользователь нажал кнопку "Позвать сотрудника"
  if (userText === '👨‍💼 Позвать сотрудника') {
    // Получаем историю чата
    const history = userHistory.get(userId) || [];
    
    // Форматируем историю для отправки
    let historyText = "Нет истории чата";
    if (history.length > 0) {
      historyText = history.map((chat, index) => 
        `Сообщение ${index + 1}:\nВопрос: ${chat.question}\nОтвет: ${chat.answer}`
      ).join('\n\n');
    }
    
    // Формируем сообщение для админа
    const adminMessage = 
`🔔 СОТРУДНИКА ЗОВУТ!

👤 Пользователь: ${userName}
🆔 ID: ${userId}

📋 История чата:
${historyText}

💬 Последнее сообщение: "${userText}"`;

    try {
      // Отправляем сообщение админу
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage);
      
      // Говорим пользователю
      await ctx.reply('Сотрудник уже свяжется с вами! Ожидайте, пожалуйста.', keyboard);
      
      // Очищаем историю после вызова
      userHistory.set(userId, []);
      
    } catch (error) {
      await ctx.reply('Произошла ошибка при вызове сотрудника. Пожалуйста, напишите нам на support@mybrand.ru', keyboard);
    }
    return;
  }

  // Если это обычное сообщение - обрабатываем через AI
  try {
    console.log(`Пользователь ${userId} спросил: ${userText}`);
    
    // Получаем ответ от AI
    const aiResponse = await askAI(userText);
    
    // Сохраняем в историю
    if (!userHistory.has(userId)) {
      userHistory.set(userId, []);
    }
    
    const history = userHistory.get(userId);
    history.push({
      question: userText,
      answer: aiResponse
    });
    
    // Ограничиваем историю (последние 10 сообщений)
    if (history.length > 10) {
      history.shift();
    }
    
    // Отправляем ответ пользователю
    await ctx.reply(aiResponse, keyboard);
    
  } catch (error) {
    console.log('Ошибка обработки сообщения:', error);
    await ctx.reply(
      'Произошла ошибка. Напишите нам на support@mybrand.ru или нажмите "Позвать сотрудника".',
      keyboard
    );
  }
});

// ===== ОБРАБОТКА ОШИБОК БОТА =====
bot.catch((error, ctx) => {
  console.log('Ошибка бота:', error);
});

// ===== ЗАПУСК БОТА =====
bot.launch().then(() => {
  console.log('🤖 Бот запущен и работает!');
}).catch((error) => {
  console.log('❌ Ошибка запуска бота:', error.message);
});

// ===== EXPRESS СЕРВЕР ДЛЯ RENDER =====
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Telegram Bot</title>
        <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            h1 { color: #0088cc; }
        </style>
    </head>
    <body>
        <h1>✅ Telegram Bot is running!</h1>
        <p>🤖 Бот поддержки работает корректно</p>
        <p>⏰ Время: ${new Date().toLocaleString('ru-RU')}</p>
    </body>
    </html>
  `);
});

// Запускаем Express сервер
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

// Корректное завершение работы
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

console.log('🔄 Скрипт запускается...');