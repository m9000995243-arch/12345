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

// ===== ИНФОРМАЦИЯ О БРЕНДЕ =====
const BRAND_INFO = `
Ты - виртуальный помощник службы поддержки бренда "Mortem Vellum".
Отвечай ТОЛЬКО на вопросы, связанные с нашей продукцией и услугами.
Если вопрос не по теме, вежливо откажись отвечать.

ИНФОРМАЦИЯ О БРЕНДЕ:
- Продаём концептуальную и модную одежду с историей создания
- Доставка: СДЭК, Почта России, Boxberry, Avito Доставка
- Телефон поддержки: +7 900 099 52 43
- Производство: ручное, принты наносим шелкографией
- Доставка во все регионы России
- Гарантия 7 дней на производственный брак
- Возврат за наш счет при нашей ошибке
- Оплата: 100% предоплата или 50% + наложенный платеж
- Обмен идеями: пришли концепцию - получи скидку 20%
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
    return "Произошла ошибка. Пожалуйста, нажмите 'Поздать сотрудника' для связи с человеком.";
  }
}

// ===== ХРАНИЛИЩЕ ИСТОРИИ ЧАТОВ =====
const userHistory = new Map();

// ===== КОМАНДА /start =====
bot.start((ctx) => {
  const userId = ctx.from.id;
  userHistory.set(userId, []);
  
  ctx.reply(
    'Привет! Я виртуальный помощник бренда Mortem Vellum. 🎨\n\nЗадайте ваш вопрос по нашей концептуальной одежде, доставке или другим услугам, и я постараюсь помочь.\n\nЕсли вам нужна помощь живого сотрудника, нажмите кнопку ниже 👇',
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
    const history = userHistory.get(userId) || [];
    
    let historyText = "Нет истории чата";
    if (history.length > 0) {
      historyText = history.map((chat, index) => 
        `💬 Сообщение ${index + 1}:\n❓ Вопрос: ${chat.question}\n💡 Ответ: ${chat.answer}`
      ).join('\n\n');
    }
    
    const adminMessage = 
`🔔 **СОТРУДНИКА ЗОВУТ!**

👤 **Пользователь:** ${userName}
🆔 **ID:** ${userId}

📋 **История чата:**
${historyText}

✉️ **Последнее сообщение:** "${userText}"`;

    try {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage);
      await ctx.reply('✅ Сотрудник уже свяжется с вами! Ожидайте, пожалуйста.', keyboard);
      userHistory.set(userId, []);
    } catch (error) {
      await ctx.reply('❌ Произошла ошибка при вызове сотрудника. Пожалуйста, напишите нам на +7 900 099 52 43', keyboard);
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
    await ctx.reply('❌ Произошла ошибка. Напишите нам на +7 900 099 52 43 или нажмите "Позвать сотрудника".', keyboard);
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
        <title>Mortem Vellum Support Bot</title>
        <style>
            body { 
                font-family: Arial, sans-serif; 
                text-align: center; 
                padding: 50px; 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
            }
            .container {
                background: rgba(255,255,255,0.1);
                padding: 30px;
                border-radius: 15px;
                backdrop-filter: blur(10px);
            }
            h1 { 
                color: #fff; 
                margin-bottom: 20px;
            }
            .status {
                font-size: 1.2em;
                margin: 10px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>✅ Mortem Vellum Support Bot</h1>
            <p class="status">🤖 Бот поддержки работает корректно</p>
            <p class="status">⏰ Время: ${new Date().toLocaleString('ru-RU')}</p>
            <p class="status">🎨 Концептуальная одежда с историей</p>
        </div>
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

console.log('🔄 Запуск бота Mortem Vellum...');
