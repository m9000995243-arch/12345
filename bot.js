const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== НАСТРОЙКИ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

console.log('🔄 Запуск бота...');

// Проверяем токен
if (!TELEGRAM_BOT_TOKEN) {
    console.log('❌ ОШИБКА: TELEGRAM_BOT_TOKEN не установлен');
    process.exit(1);
}

if (!ADMIN_CHAT_ID) {
    console.log('❌ ОШИБКА: ADMIN_CHAT_ID не установлен');
    process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ПРОСТОЕ ХРАНИЛИЩЕ =====
let waitingClients = [];

// ===== КЛАВИАТУРЫ =====
const userKeyboard = Markup.keyboard([
    ['🚚 Доставка', '🔄 Возврат'],
    ['📦 Каталог', '🏢 О бренде'],
    ['📞 Обратная связь']
]).resize();

const adminKeyboard = Markup.keyboard([
    ['📋 Список клиентов'],
    ['💬 Ответить клиенту'], 
    ['❌ Завершить диалог']
]).resize();

// ===== ДЛЯ ПОЛЬЗОВАТЕЛЕЙ =====
bot.start((ctx) => {
    console.log('✅ Получен /start');
    ctx.reply("👋 Добро пожаловать! Выберите раздел:", userKeyboard);
});

bot.hears('🚚 Доставка', (ctx) => {
    ctx.reply("🚚 Информация о доставке...", userKeyboard);
});

bot.hears('🔄 Возврат', (ctx) => {
    ctx.reply("🔄 Условия возврата...", userKeyboard);
});

bot.hears('📦 Каталог', (ctx) => {
    ctx.reply("📦 Наш каталог...", userKeyboard);
});

bot.hears('🏢 О бренде', (ctx) => {
    ctx.reply("🏢 О нашем бренде...", userKeyboard);
});

bot.hears('📞 Обратная связь', async (ctx) => {
    const user = {
        id: ctx.from.id,
        name: ctx.from.first_name || 'Клиент'
    };

    // Добавляем в список ожидания
    if (!waitingClients.find(c => c.id === user.id)) {
        waitingClients.push(user);
    }

    console.log('📨 Новый запрос от:', user.name);
    
    // Уведомляем админа
    const adminMsg = `🔔 Новый клиент: ${user.name} (ID: ${user.id})`;
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMsg, adminKeyboard);
    
    ctx.reply("✅ Запрос отправлен! Ожидайте ответа.", userKeyboard);
});

// ===== ДЛЯ АДМИНА =====
let currentDialog = null;

bot.command('admin', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    let message = `👨‍💼 Админ-панель\n`;
    message += `⏳ Клиентов: ${waitingClients.length}\n`;
    
    if (currentDialog) {
        message += `💬 В диалоге с: ${currentDialog.name}\n`;
    }
    
    ctx.reply(message, adminKeyboard);
});

// Кнопка "Список клиентов"
bot.hears('📋 Список клиентов', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (waitingClients.length === 0) {
        ctx.reply("📭 Нет клиентов", adminKeyboard);
        return;
    }
    
    let message = "📋 Клиенты:\n";
    waitingClients.forEach((client, index) => {
        message += `${index + 1}. ${client.name} (ID: ${client.id})\n`;
    });
    
    ctx.reply(message, adminKeyboard);
});

// Кнопка "Ответить клиенту" 
bot.hears('💬 Ответить клиенту', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (waitingClients.length === 0) {
        ctx.reply("📭 Нет клиентов", adminKeyboard);
        return;
    }
    
    // Берем первого клиента из списка
    const client = waitingClients[0];
    currentDialog = client;
    
    // Удаляем из списка ожидания
    waitingClients = waitingClients.filter(c => c.id !== client.id);
    
    await ctx.reply(`💬 Диалог с ${client.name}\nТеперь все ваши сообщения будут отправляться клиенту.`, adminKeyboard);
    
    // Уведомляем клиента
    await bot.telegram.sendMessage(client.id, "👨‍💼 Сотрудник на связи! Можете задавать вопросы.", userKeyboard);
});

// Кнопка "Завершить диалог"
bot.hears('❌ Запершить диалог', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (!currentDialog) {
        ctx.reply("❌ Не в диалоге", adminKeyboard);
        return;
    }
    
    const clientName = currentDialog.name;
    currentDialog = null;
    
    ctx.reply(`✅ Диалог с ${clientName} завершен`, adminKeyboard);
});

// Пересылка сообщений от клиентов админу
bot.on('text', async (ctx) => {
    // Пропускаем сообщения админа
    if (ctx.from.id.toString() === ADMIN_CHAT_ID) {
        // Если админ пишет сообщение и есть активный диалог - отправляем клиенту
        if (currentDialog && !['📋 Список клиентов', '💬 Ответить клиенту', '❌ Завершить диалог'].includes(ctx.message.text)) {
            try {
                await bot.telegram.sendMessage(currentDialog.id, `👨‍💼 Сотрудник: ${ctx.message.text}`, userKeyboard);
                ctx.reply("✅ Сообщение отправлено");
            } catch (error) {
                ctx.reply("❌ Ошибка отправки");
                currentDialog = null;
            }
        }
        return;
    }
    
    // Пересылаем сообщения от клиентов админу
    const userText = ctx.message.text;
    if (!['🚚 Доставка', '🔄 Возврат', '📦 Каталог', '🏢 О бренде', '📞 Обратная связь'].includes(userText)) {
        const userName = ctx.from.first_name || 'Клиент';
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, `📨 ${userName}: ${userText}`, adminKeyboard);
    }
});

// ===== ЗАПУСК =====
bot.launch().then(() => {
    console.log('🤖 Бот успешно запущен!');
}).catch((error) => {
    console.log('❌ Ошибка запуска бота:', error.message);
    process.exit(1);
});

// Express сервер для Render
app.get('/', (req, res) => {
    res.send('✅ Бот работает!');
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на порту ${PORT}`);
});

console.log('✅ Код загружен, запускаем бота...');
