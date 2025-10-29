const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== НАСТРОЙКИ =====
const TELEGRAM_BOT_TOKEN = "8125387296:AAHK5-dz0x84jUyu5NpqQM65RQrw6tX5E";
const HUGGING_FACE_TOKEN = "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";
const ADMIN_CHAT_ID = 1210191057;

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ИНФОРМАЦИЯ О БРЕНДЕ =====
const BRAND_INFO = `
Ты - виртуальный помощник службы поддержки бренда "Mortem Vellum".
Отвечай ТОЛЬКО на вопросы, связанные с нашей продукцией и услугами.

ИНФОРМАЦИЯ О БРЕНДЕ:
- Продаём концептуальную и модную одежду
- Доставка: СДЭК, Почта России, Boxberry, Avito Доставка
- Телефон: +7 900 099 52 43
- Производство: ручное, шелкография
- Доставка по всей России
- Гарантия 7 дней на производственный брак
- Возврат за наш счет при нашей ошибке
- Оплата: 100% предоплата или 50% предоплата + наложенный платеж
`;

// Создаём клавиатуру с кнопкой
const keyboard = Markup.keyboard([
  ['👨‍💼 Позвать сотрудника']
]).resize();

// ===== ФУНКЦИЯ ДЛЯ ЗАПРОСА К НЕЙРОСЕТИ =====
async function askAI(question) {
  try {
    const API_URL = "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium";
    const headers = { 
      "Authorization": `Bearer ${HUGGING_FACE_TOKEN}` 
    };

    const context = `${BRAND_INFO}\n\nВопрос: ${question}\nОтвет:`;
    
    const payload = {
      "inputs": context,
      "parameters": {
        "max_length": 250,
        "temperature": 0.7
      }
    };
    
    const response = await axios.post(API_URL, payload, { headers });
    
    if (response.status === 200) {
      const result = response.data;
      if (Array.isArray(result) && result.length > 0) {
        let answer = result[0].generated_text || 'Извините, не могу обработать вопрос.';
        
        if (answer.includes('Ответ:')) {
          answer = answer.split('Ответ:')[1]?.trim() || answer;
        }
        
        return answer.slice(0, 400);
      }
    }
    return "Сервис временно недоступен. Нажмите 'Позвать сотрудника'.";
    
  } catch (error) {
    return "Произошла ошибка. Нажмите 'Позвать сотрудника' для связи с человеком.";
  }
}

// ===== ХРАНИЛИЩЕ ИСТОРИИ ЧАТОВ =====
const userHistory = new Map();

// ===== КОМАНДА /start =====
bot.start((ctx) => {
  const userId = ctx.from.id;
  userHistory.set(userId, []);
  
  ctx.reply(
    'Привет! Я помощник бренда Mortem Vellum. Задайте вопрос о нашей одежде или нажмите кнопку для связи с сотрудником.',
    keyboard
  );
});

// ===== ОБРАБОТКА СООБЩЕНИЙ =====
bot.on('text', async (ctx) => {
  const userText = ctx.message.text;
  const userId = ctx.from.id;

  if (userText === '👨‍💼 Позвать сотрудника') {
    const history = userHistory.get(userId) || [];
    let historyText = "Нет истории чата";
    
    if (history.length > 0) {
      historyText = history.map((chat, index) => 
        `Сообщение ${index + 1}:\nВ: ${chat.question}\nО: ${chat.answer}`
      ).join('\n\n');
    }
    
    const adminMessage = 
`🔔 СОТРУДНИКА ЗОВУТ!

👤 ID: ${userId}

📋 История:
${historyText}`;

    try {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage);
      await ctx.reply('Сотрудник свяжется с вами! Ожидайте.', keyboard);
      userHistory.set(userId, []);
    } catch (error) {
      await ctx.reply('Ошибка при вызове сотрудника. Напишите нам +7 900 099 52 43', keyboard);
    }
    return;
  }

  try {
    const aiResponse = await askAI(userText);
    
    if (!userHistory.has(userId)) {
      userHistory.set(userId, []);
    }
    
    const history = userHistory.get(userId);
    history.push({
      question: userText,
      answer: aiResponse
    });
    
    if (history.length > 10) {
      history.shift();
    }
    
    await ctx.reply(aiResponse, keyboard);
    
  } catch (error) {
    await ctx.reply('Ошибка. Напишите нам +7 900 099 52 43', keyboard);
  }
});

// ===== ЗАПУСК БОТА =====
bot.launch().then(() => {
  console.log('🤖 Бот запущен!');
}).catch((error) => {
  console.log('❌ Ошибка:', error.message);
});

// ===== EXPRESS СЕРВЕР =====
app.get('/', (req, res) => {
  res.send(`
    <html>
    <body>
      <h1>✅ Бот работает!</h1>
      <p>Mortem Vellum Support Bot</p>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер на порту ${PORT}`);
});
