const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== НАСТРОЙКИ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ХРАНИЛИЩЕ =====
let waitingClients = []; // [{id, name, username}]
let adminInDialog = null; // {clientId, clientName}

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

const adminDialogKeyboard = Markup.keyboard([
    ['🏠 Выйти из диалога']
]).resize();

// ===== ТЕКСТ ДЛЯ КНОПОК =====
const DELIVERY_TEXT = "🚚 Информация о доставке...";
const RETURN_TEXT = "🔄 Условия возврата...";
const CATALOG_TEXT = "📦 Наш каталог...";
const ABOUT_TEXT = "🏢 О нашем бренде...";

// ===== ДЛЯ ПОЛЬЗОВАТЕЛЕЙ =====
bot.start((ctx) => {
    ctx.reply("👋 Добро пожаловать! Выберите раздел:", userKeyboard);
});

bot.hears('🚚 Доставка', (ctx) => ctx.reply(DELIVERY_TEXT, userKeyboard));
bot.hears('🔄 Возврат', (ctx) => ctx.reply(RETURN_TEXT, userKeyboard));
bot.hears('📦 Каталог', (ctx) => ctx.reply(CATALOG_TEXT, userKeyboard));
bot.hears('🏢 О бренде', (ctx) => ctx.reply(ABOUT_TEXT, userKeyboard));

bot.hears('📞 Обратная связь', async (ctx) => {
    const user = {
        id: ctx.from.id,
        name: ctx.from.first_name || 'Клиент',
        username: ctx.from.username ? `@${ctx.from.username}` : 'нет username'
    };

    // Добавляем в список ожидания
    if (!waitingClients.find(c => c.id === user.id)) {
        waitingClients.push(user);
    }

    // Уведомляем админа
    const adminMsg = `🔔 Новый клиент:\n${user.name} (${user.username})`;
    await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMsg, adminKeyboard);
    
    ctx.reply("✅ Запрос отправлен! Ожидайте ответа.", userKeyboard);
});

// Сообщения от клиентов пересылаем админу
bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() === ADMIN_CHAT_ID) return;
    
    const userText = ctx.message.text;
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'Клиент';
    
    // Если это не кнопка главного меню
    if (!['🚚 Доставка', '🔄 Возврат', '📦 Каталог', '🏢 О бренде', '📞 Обратная связь'].includes(userText)) {
        
        // Если админ в диалоге с этим клиентом
        if (adminInDialog && adminInDialog.clientId === userId) {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, `👤 ${userName}: ${userText}`, adminDialogKeyboard);
        } 
        // Если клиент в списке ожидания
        else if (waitingClients.find(c => c.id === userId)) {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, `📨 ${userName}: ${userText}\n\nНажмите '💬 Ответить клиенту'`, adminKeyboard);
        }
    }
});

// ===== ДЛЯ АДМИНА =====
bot.command('admin', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    showAdminPanel(ctx);
});

function showAdminPanel(ctx) {
    let message = `👨‍💼 Админ-панель\n`;
    message += `⏳ Клиентов: ${waitingClients.length}\n`;
    
    if (adminInDialog) {
        message += `💬 В диалоге с: ${adminInDialog.clientName}\n`;
    }
    
    ctx.reply(message, adminKeyboard);
}

// ОБРАБОТКА КНОПОК АДМИНА
bot.hears('📋 Список клиентов', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (waitingClients.length === 0) {
        ctx.reply("📭 Нет клиентов", adminKeyboard);
        return;
    }
    
    let message = "📋 Клиенты:\n";
    waitingClients.forEach((client, index) => {
        message += `${index + 1}. ${client.name} (${client.username})\n`;
    });
    
    ctx.reply(message, adminKeyboard);
});

bot.hears('💬 Ответить клиенту', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (waitingClients.length === 0) {
        ctx.reply("📭 Нет клиентов", adminKeyboard);
        return;
    }
    
    // Если всего один клиент - сразу начинаем диалог
    if (waitingClients.length === 1) {
        const client = waitingClients[0];
        adminInDialog = {
            clientId: client.id,
            clientName: client.name
        };
        
        // Удаляем из списка ожидания
        waitingClients = waitingClients.filter(c => c.id !== client.id);
        
        await ctx.reply(`💬 Диалог с ${client.name}\nПишите сообщения - они отправятся клиенту.`, adminDialogKeyboard);
        
        // Уведомляем клиента
        await bot.telegram.sendMessage(client.id, "👨‍💼 Сотрудник на связи! Можете задавать вопросы.", userKeyboard);
        
    } else {
        // Если несколько клиентов - показываем список
        let message = "Выберите клиента:\n";
        waitingClients.forEach((client, index) => {
            message += `\n${index + 1}. ${client.name}`;
        });
        message += "\n\nНапишите номер клиента:";
        
        ctx.reply(message, Markup.keyboard([['↩️ Назад']]).resize());
    }
});

bot.hears('❌ Завершить диалог', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (!adminInDialog) {
        ctx.reply("❌ Не в диалоге", adminKeyboard);
        return;
    }
    
    const clientName = adminInDialog.clientName;
    
    // Уведомляем клиента
    try {
        await bot.telegram.sendMessage(adminInDialog.clientId, "💬 Диалог завершен. Если нужна помощь - нажмите '📞 Обратная связь'", userKeyboard);
    } catch (error) {}
    
    adminInDialog = null;
    ctx.reply(`✅ Диалог с ${clientName} завершен`, adminKeyboard);
});

bot.hears('🏠 Выйти из диалога', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (!adminInDialog) {
        ctx.reply("❌ Не в диалоге", adminKeyboard);
        return;
    }
    
    adminInDialog = null;
    ctx.reply("✅ Вы вышли из диалога", adminKeyboard);
});

bot.hears('↩️ Назад', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    showAdminPanel(ctx);
});

// Обработка выбора клиента по номеру
bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    const text = ctx.message.text;
    const number = parseInt(text);
    
    // Если ввели число и есть клиенты
    if (!isNaN(number) && number >= 1 && number <= waitingClients.length) {
        const client = waitingClients[number - 1];
        adminInDialog = {
            clientId: client.id,
            clientName: client.name
        };
        
        // Удаляем из списка ожидания
        waitingClients = waitingClients.filter(c => c.id !== client.id);
        
        await ctx.reply(`💬 Диалог с ${client.name}\nПишите сообщения - они отправятся клиенту.`, adminDialogKeyboard);
        
        // Уведомляем клиента
        await bot.telegram.sendMessage(client.id, "👨‍💼 Сотрудник на связи! Можете задавать вопросы.", userKeyboard);
    }
    // Если админ пишет сообщение и в диалоге - отправляем клиенту
    else if (adminInDialog && !['📋 Список клиентов', '💬 Ответить клиенту', '❌ Завершить диалог', '🏠 Выйти из диалога', '↩️ Назад'].includes(text)) {
        try {
            await bot.telegram.sendMessage(adminInDialog.clientId, `👨‍💼 Сотрудник: ${text}`, userKeyboard);
            ctx.reply("✅ Отправлено", adminDialogKeyboard);
        } catch (error) {
            ctx.reply("❌ Ошибка отправки", adminKeyboard);
            adminInDialog = null;
        }
    }
});

// ===== ЗАПУСК =====
bot.launch().then(() => {
    console.log('🤖 Бот запущен!');
}).catch(console.error);

app.get('/', (req, res) => res.send('✅ Бот работает'));
app.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));
