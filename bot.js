const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== НАСТРОЙКИ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const HUGGING_FACE_TOKEN = process.env.HUGGING_FACE_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

console.log('🔄 Запуск бота...');

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ХРАНИЛИЩЕ =====
let activeUsers = []; // [{id, name, history}]

// ===== КЛАВИАТУРЫ =====
const userKeyboard = Markup.keyboard([['👨‍💼 Позвать сотрудника']]).resize();
const adminKeyboard = Markup.keyboard([
    ['📋 Список пользователей'],
    ['🗑️ Очистить список']
]).resize();

// ===== НЕЙРОСЕТЬ =====
async function askAI(question) {
    try {
        if (!HUGGING_FACE_TOKEN) {
            return getSimpleResponse(question);
        }

        const BRAND_INFO = `
        Ты - помощник бренда одежды "Mortem Vellum". Отвечай кратко и по делу.
        Информация о бренде:
        - Концептуальная одежда с уникальными принтами
        - Доставка: СДЭК, Почта России, Boxberry (2-5 дней)
        - Телефон: +7 900 099 52 43
        - Производство: ручное, шелкография
        - Гарантия: 7 дней на производственный брак
        - Оплата: 100% предоплата или 50% + наложенный платеж
        - Размеры: S, M, L, XL
        - Цены: от 1500 до 5000 рублей
        
        Вопрос: ${question}
        Ответ:`;

        const response = await axios.post(
            'https://api-inference.huggingface.co/models/microsoft/DialoGPT-medium',
            {
                inputs: BRAND_INFO,
                parameters: {
                    max_length: 200,
                    temperature: 0.7
                }
            },
            {
                headers: { 
                    'Authorization': `Bearer ${HUGGING_FACE_TOKEN}` 
                },
                timeout: 10000
            }
        );

        if (response.data && response.data[0] && response.data[0].generated_text) {
            let answer = response.data[0].generated_text;
            // Очищаем ответ
            if (answer.includes('Ответ:')) {
                answer = answer.split('Ответ:')[1]?.trim();
            }
            return answer || getSimpleResponse(question);
        }
        
        return getSimpleResponse(question);
        
    } catch (error) {
        console.log('Ошибка нейросети:', error.message);
        return getSimpleResponse(question);
    }
}

// ===== ПРОСТЫЕ ОТВЕТЫ ЕСЛИ НЕЙРОСЕТЬ НЕ РАБОТАЕТ =====
function getSimpleResponse(text) {
    text = text.toLowerCase();
    
    if (text.includes('привет') || text.includes('здравств')) {
        return 'Привет! Я помощник Mortem Vellum. Чем могу помочь?';
    }
    if (text.includes('достав')) {
        return '🚚 Доставка: СДЭК, Почта России, Boxberry (2-5 дней). Отправляем за 1-2 рабочих дня.';
    }
    if (text.includes('оплат') || text.includes('цена')) {
        return '💳 Оплата: картой или наложенный платеж. Цены от 1500 до 5000 рублей.';
    }
    if (text.includes('гарант') || text.includes('возврат')) {
        return '🛡️ Гарантия 7 дней на производственный брак. Возврат за наш счет при нашей ошибке.';
    }
    if (text.includes('размер')) {
        return '📏 Размеры: S, M, L, XL. Рекомендуем стандартные размеры.';
    }
    if (text.includes('контакт') || text.includes('телефон')) {
        return '📞 Телефон: +7 900 099 52 43';
    }
    if (text.includes('бренд') || text.includes('mortem')) {
        return '🎭 Mortem Vellum - концептуальная одежда с уникальными принтами.';
    }
    if (text.includes('коллекц') || text.includes('одежд')) {
        return '👕 Худи, футболки, свитшоты с уникальными принтами. Каждая модель ограниченным тиражом.';
    }
    
    return 'Расскажите подробнее о вашем вопросе или нажмите кнопку для связи с сотрудником.';
}

// ===== ДЛЯ ПОЛЬЗОВАТЕЛЕЙ =====
bot.start((ctx) => {
    ctx.reply(
        'Привет! Я помощник бренда Mortem Vellum. 🎭\n\nЗадайте вопрос о нашей одежде, доставке или оплате - я постараюсь помочь!\n\nЕсли нужна помощь сотрудника - нажмите кнопку ниже 👇',
        userKeyboard
    );
});

bot.on('text', async (ctx) => {
    const userText = ctx.message.text;
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'Пользователь';

    // Если нажата кнопка "Позвать сотрудника"
    if (userText === '👨‍💼 Позвать сотрудника') {
        // Добавляем/обновляем пользователя в активных
        const userIndex = activeUsers.findIndex(u => u.id === userId);
        if (userIndex === -1) {
            activeUsers.push({
                id: userId,
                name: userName,
                timestamp: Date.now()
            });
        } else {
            activeUsers[userIndex].timestamp = Date.now();
        }

        const adminMessage = 
`🔔 НОВЫЙ ЗАПРОС!

👤 ${userName}
🆔 ${userId}
⏰ ${new Date().toLocaleString('ru-RU')}

💬 Ответьте командой:
/r${userId} ваш текст

📋 Или посмотрите список: /admin`;

        try {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, adminKeyboard);
            await ctx.reply('✅ Сотрудник уведомлен! Он свяжется с вами в ближайшее время.', userKeyboard);
        } catch (error) {
            await ctx.reply('❌ Ошибка связи. Попробуйте позже.', userKeyboard);
        }
        return;
    }

    // Обычные сообщения - обрабатываем через нейросеть
    try {
        const response = await askAI(userText);
        await ctx.reply(response, userKeyboard);
        
    } catch (error) {
        const simpleResponse = getSimpleResponse(userText);
        await ctx.reply(simpleResponse, userKeyboard);
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
    let message = `👨‍💼 Панель администратора\n\n`;
    message += `📊 Активных пользователей: ${activeUsers.length}\n\n`;
    
    if (activeUsers.length > 0) {
        message += `📋 Список запросов:\n`;
        activeUsers.forEach((user, index) => {
            const timeAgo = Math.round((Date.now() - user.timestamp) / 60000);
            message += `${index + 1}. ${user.name}\n`;
            message += `   🆔 ${user.id}\n`;
            message += `   ⏰ ${timeAgo} мин. назад\n`;
            message += `   💬 /r${user.id} ваш_текст\n\n`;
        });
        message += `💡 Для ответа используйте: /rID текст`;
    } else {
        message += `📭 Активных запросов нет`;
    }
    
    ctx.reply(message, adminKeyboard);
}

// Команда /r для ответа пользователю
bot.hears(/^\/r(\d+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    const text = ctx.message.text;
    const match = text.match(/^\/r(\d+)\s+(.+)/);
    
    if (!match) {
        return ctx.reply('❌ Используйте: /rID ваш_текст\nПример: /r123456789 Привет! Чем могу помочь?');
    }
    
    const userId = match[1];
    const message = match[2];
    
    // Ищем пользователя
    const userIndex = activeUsers.findIndex(u => u.id == userId);
    if (userIndex === -1) {
        return ctx.reply('❌ Пользователь не найден в активных запросах');
    }
    
    const userName = activeUsers[userIndex].name;
    
    try {
        // Отправляем сообщение пользователю
        await bot.telegram.sendMessage(
            userId, 
            `👨‍💼 Ответ от сотрудника:\n\n${message}`,
            userKeyboard
        );
        
        // Удаляем пользователя из активных после ответа
        activeUsers.splice(userIndex, 1);
        
        await ctx.reply(`✅ Ответ отправлен ${userName} (ID: ${userId})`, adminKeyboard);
        
    } catch (error) {
        await ctx.reply(`❌ Ошибка отправки для ${userName}. Пользователь заблокировал бота.`, adminKeyboard);
        // Удаляем неактивного пользователя
        activeUsers.splice(userIndex, 1);
    }
});

// Команда /remove для удаления пользователя
bot.hears(/^\/remove(\d+)/, (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    const text = ctx.message.text;
    const match = text.match(/^\/remove(\d+)/);
    
    if (match) {
        const userId = match[1];
        const userIndex = activeUsers.findIndex(u => u.id == userId);
        
        if (userIndex !== -1) {
            const userName = activeUsers[userIndex].name;
            activeUsers.splice(userIndex, 1);
            ctx.reply(`✅ Пользователь ${userName} (ID: ${userId}) удален из списка`, adminKeyboard);
        } else {
            ctx.reply('❌ Пользователь не найден', adminKeyboard);
        }
    }
});

// Обработка кнопок админа
bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    const text = ctx.message.text;
    
    // Кнопка "Список пользователей"
    if (text === '📋 Список пользователей') {
        showAdminPanel(ctx);
        return;
    }
    
    // Кнопка "Очистить список"
    if (text === '🗑️ Очистить список') {
        activeUsers = [];
        await ctx.reply('✅ Список активных пользователей очищен!', adminKeyboard);
        return;
    }
    
    // Если админ пишет что-то другое (не команду)
    if (!text.startsWith('/')) {
        ctx.reply('💡 Используйте:\n• /admin - панель управления\n• /rID текст - ответить пользователю\n• Кнопки ниже', adminKeyboard);
    }
});

// ===== ЗАПУСК =====
bot.launch().then(() => {
    console.log('🤖 Бот запущен!');
    console.log('👨‍💼 Команды админа: /admin, /rID текст');
}).catch((error) => {
    console.log('❌ Ошибка запуска:', error.message);
});

app.get('/', (req, res) => {
    res.send('✅ Бот работает!');
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер на порту ${PORT}`);
});
