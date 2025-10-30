const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('=== 🚀 ЗАПУСК БОТА ===');

// ===== НАСТРОЙКИ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ХРАНИЛИЩЕ =====
let waitingClients = []; // [{id, name, username}]
let adminState = { currentAction: null, selectedUser: null };

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

    if (!waitingClients.find(c => c.id === user.id)) {
        waitingClients.push(user);
    }

    // Создаем инлайн-кнопки для админа
    const buttons = waitingClients.map(client => 
        [Markup.button.callback(
            `👤 ${client.name} (${client.username})`, 
            `select_client_${client.id}`
        )]
    );

    const adminMessage = 
`🔔 НОВЫЙ ЗАПРОС ОТ КЛИЕНТА!

👤 ${user.name} (${user.username})
🆔 ${user.id}

Выберите клиента для ответа:`;

    try {
        await bot.telegram.sendMessage(
            ADMIN_CHAT_ID, 
            adminMessage, 
            Markup.inlineKeyboard(buttons)
        );
        ctx.reply("✅ Запрос отправлен! Ожидайте ответа.", userKeyboard);
    } catch (error) {
        ctx.reply("❌ Ошибка отправки.", userKeyboard);
    }
});

// ===== ИНЛАЙН-КНОПКИ ДЛЯ АДМИНА =====

// Обработка выбора клиента
bot.action(/select_client_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    const clientId = ctx.match[1];
    const client = waitingClients.find(c => c.id == clientId);
    
    if (!client) {
        return ctx.answerCbQuery('❌ Клиент не найден');
    }

    // Сохраняем выбранного клиента
    adminState.selectedUser = clientId;
    
    // Удаляем клиента из списка ожидания
    waitingClients = waitingClients.filter(c => c.id != clientId);
    
    // Обновляем сообщение с кнопками
    await ctx.editMessageText(
        `✅ Вы выбрали: ${client.name} (${client.username})\n\n💬 Теперь все ваши сообщения будут отправляться этому клиенту.\n\nДля завершения диалога нажмите кнопку ниже:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('❌ Завершить диалог', `end_dialog_${clientId}`)]
        ])
    );
    
    // Уведомляем клиента
    await bot.telegram.sendMessage(clientId, "👨‍💼 Сотрудник на связи! Можете задавать вопросы.", userKeyboard);
    
    ctx.answerCbQuery(`✅ Диалог с ${client.name}`);
});

// Обработка завершения диалога
bot.action(/end_dialog_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    const clientId = ctx.match[1];
    const client = waitingClients.find(c => c.id == clientId) || 
                   (adminState.selectedUser == clientId ? {name: 'Клиент'} : null);
    
    if (!client) {
        return ctx.answerCbQuery('❌ Клиент не найден');
    }

    // Сбрасываем состояние
    adminState.selectedUser = null;
    waitingClients = waitingClients.filter(c => c.id != clientId);
    
    // Обновляем сообщение
    await ctx.editMessageText(
        `✅ Диалог с ${client.name} завершен`,
        Markup.inlineKeyboard([])
    );
    
    // Уведомляем клиента
    try {
        await bot.telegram.sendMessage(
            clientId, 
            "💬 Диалог с сотрудником завершен. Если нужна помощь - нажмите '📞 Обратная связь'", 
            userKeyboard
        );
    } catch (error) {
        // Игнорируем если клиент заблокировал бота
    }
    
    ctx.answerCbQuery('✅ Диалог завершен');
});

// ===== ОБРАБОТКА СООБЩЕНИЙ =====

// Сообщения от клиентов пересылаем админу
bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() === ADMIN_CHAT_ID) return;
    
    const userText = ctx.message.text;
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'Клиент';
    
    // Если это не кнопка главного меню
    if (!['🚚 Доставка', '🔄 Возврат', '📦 Каталог', '🏢 О бренде', '📞 Обратная связь'].includes(userText)) {
        
        // Если клиент в списке ожидания
        if (waitingClients.find(c => c.id === userId)) {
            // Создаем кнопки для ответа
            const buttons = [[
                Markup.button.callback(`💬 Ответить ${userName}`, `select_client_${userId}`)
            ]];
            
            await bot.telegram.sendMessage(
                ADMIN_CHAT_ID, 
                `📨 ${userName}:\n${userText}`,
                Markup.inlineKeyboard(buttons)
            );
        }
        // Если админ в диалоге с этим клиентом
        else if (adminState.selectedUser == userId) {
            await bot.telegram.sendMessage(
                ADMIN_CHAT_ID, 
                `👤 ${userName}:\n${userText}`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Завершить диалог', `end_dialog_${userId}`)]
                ])
            );
        }
    }
});

// Сообщения от админа пересылаем клиенту
bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    const adminText = ctx.message.text;
    
    // Если админ пишет сообщение и есть выбранный клиент
    if (adminState.selectedUser && !['📋 Список клиентов', '💬 Ответить клиенту', '❌ Завершить диалог'].includes(adminText)) {
        try {
            await bot.telegram.sendMessage(
                adminState.selectedUser, 
                `👨‍💼 Сотрудник:\n${adminText}`,
                userKeyboard
            );
            ctx.reply("✅ Сообщение отправлено");
        } catch (error) {
            ctx.reply("❌ Ошибка отправки. Клиент заблокировал бота.");
            adminState.selectedUser = null;
        }
    }
});

// ===== КОМАНДЫ АДМИНА =====
bot.command('admin', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (waitingClients.length === 0) {
        ctx.reply("📭 Нет клиентов в ожидании", adminKeyboard);
        return;
    }
    
    // Создаем кнопки для всех клиентов
    const buttons = waitingClients.map(client => 
        [Markup.button.callback(
            `👤 ${client.name} (${client.username})`, 
            `select_client_${client.id}`
        )]
    );
    
    ctx.reply(
        `📋 Клиенты в ожидании: ${waitingClients.length}\n\nВыберите клиента:`,
        Markup.inlineKeyboard(buttons)
    );
});

// Кнопка "Список клиентов"
bot.hears('📋 Список клиентов', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    if (waitingClients.length === 0) {
        ctx.reply("📭 Нет клиентов в ожидании", adminKeyboard);
        return;
    }
    
    const buttons = waitingClients.map(client => 
        [Markup.button.callback(
            `👤 ${client.name} (${client.username})`, 
            `select_client_${client.id}`
        )]
    );
    
    ctx.reply(
        `📋 Клиенты в ожидании: ${waitingClients.length}\n\nВыберите клиента:`,
        Markup.inlineKeyboard(buttons)
    );
});

// ===== ЗАПУСК =====
bot.launch().then(() => {
    console.log('🤖 Бот запущен!');
}).catch((error) => {
    console.log('❌ Ошибка:', error.message);
});

app.get('/', (req, res) => res.send('✅ Бот работает'));
app.listen(PORT, () => console.log(`🚀 Сервер на порту ${PORT}`));
