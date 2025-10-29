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

// Создаём клавиатуру с кнопкой
const keyboard = Markup.keyboard([
  ['👨‍💼 Позвать сотрудника']
]).resize();

// ===== УМНЫЕ ОТВЕТЫ БЕЗ НЕЙРОСЕТИ =====
function getSmartResponse(question) {
  const lowerQuestion = question.toLowerCase();
  
  // Приветствие
  if (lowerQuestion.includes('привет') || lowerQuestion.includes('здравств')) {
    return `Привет! Я помощник бренда ${BRAND_INFO.name}. Чем могу помочь?`;
  }
  
  // Доставка
  if (lowerQuestion.includes('достав') || lowerQuestion.includes('срок') || lowerQuestion.includes('получ')) {
    return `🚚 ${BRAND_INFO.delivery}\n\nМы отправляем заказы в течение 1-2 рабочих дней после оплаты.`;
  }
  
  // Оплата
  if (lowerQuestion.includes('оплат') || lowerQuestion.includes('цена') || lowerQuestion.includes('стоим') || lowerQuestion.includes('куп')) {
    return `💳 ${BRAND_INFO.payment}\n\nЦены от 1500 до 5000 рублей в зависимости от модели и сложности принта.`;
  }
  
  // Гарантия и возврат
  if (lowerQuestion.includes('гарант') || lowerQuestion.includes('возврат') || lowerQuestion.includes('брак')) {
    return `🛡️ ${BRAND_INFO.warranty}\n\n${BRAND_INFO.returnPolicy}\n\nЕсли товар пришел с дефектом - свяжитесь с нами!`;
  }
  
  // Производство
  if (lowerQuestion.includes('производств') || lowerQuestion.includes('сдела') || lowerQuestion.includes('качеств') || lowerQuestion.includes('материал')) {
    return `🎨 ${BRAND_INFO.production}\n\nКаждая вещь создается вручную с вниманием к деталям. Используем качественные материалы.`;
  }
  
  // Контакты
  if (lowerQuestion.includes('контакт') || lowerQuestion.includes('телефон') || lowerQuestion.includes('связаться') || lowerQuestion.includes('номер')) {
    return `📞 ${BRAND_INFO.phone}\n\nЗвоните или пишите в WhatsApp/Telegram по этому номеру.`;
  }
  
  // О бренде
  if (lowerQuestion.includes('бренд') || lowerQuestion.includes('марка') || lowerQuestion.includes('компания') || lowerQuestion.includes('mortem') || lowerQuestion.includes('vellum')) {
    return `🎭 ${BRAND_INFO.name} - это ${BRAND_INFO.description}.\n\nМы создаем одежду, которая рассказывает историю и выражает индивидуальность.`;
  }
  
  // Коллекция/товары
  if (lowerQuestion.includes('коллекц') || lowerQuestion.includes('товар') || lowerQuestion.includes('одежд') || lowerQuestion.includes('футбол') || lowerQuestion.includes('худи') || lowerQuestion.includes('свитшот')) {
    return `👕 У нас есть худи, футболки и свитшоты с уникальными принтами.\n\nКаждая модель выпускается ограниченным тиражом. Подробности уточняйте у сотрудника.`;
  }
  
  // Размеры
  if (lowerQuestion.includes('размер') || lowerQuestion.includes('мерк') || lowerQuestion.includes('s') || lowerQuestion.includes('m') || lowerQuestion.includes('l') || lowerQuestion.includes('xl')) {
    return `📏 Есть размеры от S до XL.\n\nРекомендуем ориентироваться на ваши стандартные размеры. Если сомневаетесь - можем помочь с выбором.`;
  }
  
  // Стандартный ответ для неизвестных вопросов
  return `Расскажите подробнее о вашем вопросе. Или можете:\n• Узнать о доставке\n• Уточнить условия оплаты  \n• Получить консультацию по размерам\n• Нажать кнопку ниже для связи с сотрудником`;
}

// ===== ФУНКЦИЯ ДЛЯ НЕЙРОСЕТИ (РЕЗЕРВНАЯ) =====
async function askAI(question) {
  try {
    // Сначала пробуем умные ответы
    const smartResponse = getSmartResponse(question);
    if (!smartResponse.includes('Расскажите подробнее')) {
      return smartResponse;
    }
    
    // Если не нашли умный ответ, пробуем нейросеть
    if (!HUGGING_FACE_TOKEN) {
      return "В настоящее время я могу ответить на вопросы о доставке, оплате, размерах и гарантии. Для других вопросов нажмите 'Позвать сотрудника'.";
    }
    
    const API_URL = "https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium";
    const headers = { 
      "Authorization": `Bearer ${HUGGING_FACE_TOKEN}` 
    };

    const context = `Ты помощник бренда одежды. Отвечай кратко и по делу.
    
Вопрос: ${question}
Ответ:`;
    
    const payload = {
      "inputs": context,
      "parameters": {
        "max_length": 150,
        "temperature": 0.7
      }
    };
    
    const response = await axios.post(API_URL, payload, { headers, timeout: 10000 });
    
    if (response.status === 200 && response.data && response.data[0]?.generated_text) {
      return response.data[0].generated_text.slice(0, 300);
    }
    
    return getSmartResponse(question);
    
  } catch (error) {
    console.log('Ошибка AI, используем умные ответы:', error.message);
    return getSmartResponse(question);
  }
}

// ===== ХРАНИЛИЩЕ ИСТОРИИ ЧАТОВ =====
const userHistory = new Map();

// ===== КОМАНДА /start =====
bot.start((ctx) => {
  const userId = ctx.from.id;
  userHistory.set(userId, []);
  
  ctx.reply(
    `Привет! Я помощник бренда ${BRAND_INFO.name}. 🎭\n\nМогу помочь с:\n• Доставкой и сроками\n• Оплатой и ценами\n• Размерами и выбором\n• Гарантией и возвратом\n\nЗадайте вопрос или нажмите кнопку для связи с сотрудником 👇`,
    keyboard
  );
});

// ===== ОБРАБОТКА СООБЩЕНИЙ =====
bot.on('text', async (ctx) => {
  const userText = ctx.message.text;
  const userId = ctx.from.id;
  const userName = ctx.from.first_name || 'Пользователь';

  // Если пользователь нажал кнопку "Позвать сотрудника"
  if (userText === '👨‍💼 Позвать сотрудника') {
    const history = userHistory.get(userId) || [];
    
    let historyText = "Нет истории чата";
    if (history.length > 0) {
      historyText = history.slice(-3).map((chat, index) => 
        `💬 ${index + 1}. В: ${chat.question}\n💡 О: ${chat.answer}`
      ).join('\n\n');
    }
    
    const adminMessage = 
`🔔 СОТРУДНИКА ЗОВУТ!

👤 Пользователь: ${userName}
🆔 ID: ${userId}

📋 История чата:
${historyText}

✉️ Последнее сообщение: "${userText}"`;

    try {
      await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage);
      await ctx.reply('✅ Сотрудник уже свяжется с вами! Ожидайте, пожалуйста.', keyboard);
      userHistory.set(userId, []);
    } catch (error) {
      await ctx.reply('📞 Позвоните нам: ' + BRAND_INFO.phone, keyboard);
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
    
    if (history.length > 5) {
      history.shift();
    }
    
    await ctx.reply(aiResponse, keyboard);
  } catch (error) {
    await ctx.reply('📞 Для связи с сотрудником позвоните по номеру: ' + BRAND_INFO.phone, keyboard);
  }
});

// ===== ЗАПУСК БОТА =====
bot.launch().then(() => {
  console.log('🤖 Бот запущен и работает!');
}).catch((error) => {
  console.log('❌ Ошибка запуска бота:', error.message);
});

// ===== EXPRESS СЕРВЕР =====
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
        </style>
    </head>
    <body>
        <div class="container">
            <h1>✅ Mortem Vellum Support Bot</h1>
            <p>🤖 Бот работает стабильно</p>
            <p>🎭 Концептуальная одежда с историей</p>
        </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер на порту ${PORT}`);
});
