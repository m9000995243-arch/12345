const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('=== 🚀 НАЧАЛО ЗАПУСКА ===');

// ===== ПРОВЕРКА ПЕРЕМЕННЫХ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

console.log('🔧 TELEGRAM_BOT_TOKEN:', TELEGRAM_BOT_TOKEN ? 'ЕСТЬ' : 'НЕТ!');
console.log('🔧 ADMIN_CHAT_ID:', ADMIN_CHAT_ID ? 'ЕСТЬ' : 'НЕТ!');

if (!TELEGRAM_BOT_TOKEN) {
    console.log('❌ КРИТИЧЕСКАЯ ОШИБКА: TELEGRAM_BOT_TOKEN не установлен!');
    console.log('💡 Добавь в Environment Variables:');
    console.log('   TELEGRAM_BOT_TOKEN = твой_токен_от_BotFather');
    process.exit(1);
}

if (!ADMIN_CHAT_ID) {
    console.log('❌ КРИТИЧЕСКАЯ ОШИБКА: ADMIN_CHAT_ID не установлен!');
    console.log('💡 Добавь в Environment Variables:');
    console.log('   ADMIN_CHAT_ID = твой_id_из_@userinfobot');
    process.exit(1);
}

console.log('✅ Все переменные проверены');

// ===== СОЗДАНИЕ БОТА =====
try {
    console.log('🤖 Создаю бота...');
    const bot = new Telegraf(TELEGRAM_BOT_TOKEN);
    console.log('✅ Бот создан');
} catch (error) {
    console.log('❌ Ошибка создания бота:', error.message);
    process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ПРОСТОЕ ХРАНИЛИЩЕ =====
let waitingClients = [];
let currentDialog = null;

console.log('✅ Хранилище инициализировано');

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

console.log('✅ Клавиатуры созданы');

// ===== ДЛЯ ПОЛЬЗОВАТЕЛЕЙ =====
bot.start((ctx) => {
    console.log('🎯 Получен /start от:', ctx.from.id);
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

    if (!waitingClients.find(c => c.id === user.id)) {
        waitingClients.push(user);
    }

    console.log('📨 Новый запрос от:', user.name);
    
    try {
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, `🔔 Новый клиент: ${user.name}`, adminKeyboard);
        ctx.reply("✅ Запрос отправлен! Ожидайте ответа.", userKeyboard);
    } catch (error) {
        console.log('❌ Ошибка отправки админу:', error.message);
        ctx.reply("❌ Ошибка отправки.", userKeyboard);
    }
});

// ===== ДЛЯ АДМИНА =====
bot.command('admin', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    let message = `👨‍💼 Админ-панель\n⏳ Клиентов: ${waitingClients.length}`;
    if (currentDialog) message += `\n💬 В диалоге с: ${currentDialog.name}`;
    
    ctx.reply(message, adminKeyboard);
});

bot.hears('📋 Список клиентов', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (waitingClients.length === 0) {
        ctx.reply("📭 Нет клиентов", adminKeyboard);
        return;
    }
    
    let message = "📋 Клиенты:\n";
    waitingClients.forEach((client, index) => {
        message += `${index + 1}. ${client.name}\n`;
    });
    
    ctx.reply(message, adminKeyboard);
});

bot.hears('💬 Ответить клиенту', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (waitingClients.length === 0) {
        ctx.reply("📭 Нет клиентов", adminKeyboard);
        return;
    }
    
    const client = waitingClients[0];
    currentDialog = client;
    waitingClients = waitingClients.filter(c => c.id !== client.id);
    
    await ctx.reply(`💬 Диалог с ${client.name}`, adminKeyboard);
    
    try {
        await bot.telegram.sendMessage(client.id, "👨‍💼 Сотрудник на связи!", userKeyboard);
    } catch (error) {
        ctx.reply("❌ Клиент заблокировал бота");
        currentDialog = null;
    }
});

bot.hears('❌ Завершить диалог', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (!currentDialog) {
        ctx.reply("❌ Не в диалоге", adminKeyboard);
        return;
    }
    
    ctx.reply(`✅ Диалог с ${currentDialog.name} завершен`, adminKeyboard);
    currentDialog = null;
});

// Пересылка сообщений
bot.on('text', async (ctx) => {
    // Админ пишет клиенту
    if (ctx.from.id.toString() === ADMIN_CHAT_ID && currentDialog) {
        const text = ctx.message.text;
        if (!['📋 Список клиентов', '💬 Ответить клиенту', '❌ Завершить диалог'].includes(text)) {
            try {
                await bot.telegram.sendMessage(currentDialog.id, `👨‍💼 ${text}`, userKeyboard);
                ctx.reply("✅ Отправлено");
            } catch (error) {
                ctx.reply("❌ Ошибка отправки");
                currentDialog = null;
            }
        }
        return;
    }
    
    // Клиент пишет админу
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) {
        const text = ctx.message.text;
        if (!['🚚 Доставка', '🔄 Возврат', '📦 Каталог', '🏢 О бренде', '📞 Обратная связь'].includes(text)) {
            try {
                await bot.telegram.sendMessage(ADMIN_CHAT_ID, `📨 ${ctx.from.first_name}: ${text}`, adminKeyboard);
            } catch (error) {
                console.log('❌ Ошибка пересылки:', error.message);
            }
        }
    }
});

// ===== ЗАПУСК БОТА =====
console.log('🚀 Запускаю бота...');

bot.launch().then(() => {
    console.log('🎉 🤖 БОТ УСПЕШНО ЗАПУЩЕН!');
    console.log('👉 Тестируй в Telegram');
}).catch((error) => {
    console.log('💥 КРИТИЧЕСКАЯ ОШИБКА ЗАПУСКА:');
    console.log('Сообщение:', error.message);
    console.log('Стек:', error.stack);
    process.exit(1);
});

// ===== EXPRESS СЕРВЕР =====
app.get('/', (req, res) => {
    res.send('✅ Бот работает!');
});

app.listen(PORT, () => {
    console.log(`🌐 Сервер запущен на порту ${PORT}`);
});

console.log('✅ Всё инициализировано, ждём запуска бота...');
