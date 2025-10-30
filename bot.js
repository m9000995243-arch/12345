const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== НАСТРОЙКИ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ХРАНИЛИЩЕ =====
const activeUsers = new Map(); // userId -> {userName, chatId}
let adminState = { currentAction: null, selectedUser: null };

// ===== КЛАВИАТУРЫ =====
const mainKeyboard = Markup.keyboard([
    ['🚚 Доставка', '🔄 Возврат'],
    ['📦 Каталог', '🏢 О бренде'],
    ['📞 Обратная связь']
]).resize();

const adminKeyboard = Markup.keyboard([
    ['💬 Ответить клиенту', '❌ Завершить диалог'],
    ['📋 Список клиентов']
]).resize();

const adminCancelKeyboard = Markup.keyboard([['↩️ Отмена']]).resize();

// ===== ТЕКСТ ДЛЯ КНОПОК (ЗАПОЛНИ ЭТО САМ) =====

// === ЗАПОЛНИ ЭТОТ ТЕКСТ ===
const DELIVERY_TEXT = `
🚚 ИНФОРМАЦИЯ О ДОСТАВКЕ

[ЗДЕСЬ ТВОЙ ТЕКСТ О ДОСТАВКЕ]
Например: сроки, стоимость, способы доставки
`;

const RETURN_TEXT = `
🔄 УСЛОВИЯ ВОЗВРАТА

[ЗДЕСЬ ТВОЙ ТЕКСТ О ВОЗВРАТЕ]
Например: условия возврата, сроки, процедура
`;

const CATALOG_TEXT = `
📦 НАШ КАТАЛОГ

[ЗДЕСЬ ТВОЙ ТЕКСТ О КАТАЛОГЕ]
Например: категории товаров, новинки, хиты продаж
`;

const ABOUT_TEXT = `
🏢 О НАШЕМ БРЕНДЕ

[ЗДЕСЬ ТВОЙ ТЕКСТ О БРЕНДЕ]
Например: философия бренда, история, преимущества
`;
// === КОНЕЦ ЗАПОЛНЕНИЯ ===

// ===== ДЛЯ ПОЛЬЗОВАТЕЛЕЙ =====
bot.start((ctx) => {
    ctx.reply(
        `👋 Добро пожаловать в наш магазин!\n\nВыберите интересующий вас раздел:`,
        mainKeyboard
    );
});

bot.hears('🚚 Доставка', (ctx) => {
    ctx.reply(DELIVERY_TEXT, mainKeyboard);
});

bot.hears('🔄 Возврат', (ctx) => {
    ctx.reply(RETURN_TEXT, mainKeyboard);
});

bot.hears('📦 Каталог', (ctx) => {
    ctx.reply(CATALOG_TEXT, mainKeyboard);
});

bot.hears('🏢 О бренде', (ctx) => {
    ctx.reply(ABOUT_TEXT, mainKeyboard);
});

bot.hears('📞 Обратная связь', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'Пользователь';
    const username = ctx.from.username ? `@${ctx.from.username}` : 'нет username';

    // Добавляем пользователя в активные
    activeUsers.set(userId.toString(), {
        userName: userName,
        chatId: ctx.chat.id,
        username: username
    });

    // Сообщение админу
    const adminMessage = 
`🔔 НОВЫЙ ЗАПРОС ОБРАТНОЙ СВЯЗИ!

👤 Имя: ${userName}
📱 Username: ${username}
🆔 ID: ${userId}
⏰ Время: ${new Date().toLocaleString('ru-RU')}

Пользователь ожидает ответа!`;

    try {
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, adminKeyboard);
        await ctx.reply('✅ Ваш запрос отправлен! Сотрудник свяжется с вами в ближайшее время.', mainKeyboard);
    } catch (error) {
        await ctx.reply('❌ Ошибка отправки. Попробуйте позже.', mainKeyboard);
    }
});

// Перехватываем все сообщения от пользователей ожидающих ответа
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userText = ctx.message.text;
    const userName = ctx.from.first_name || 'Пользователь';

    // Если пользователь активен в списке ожидания - пересылаем его сообщение админу
    if (activeUsers.has(userId) && !userText.startsWith('/')) {
        const adminMessage = 
`📨 Сообщение от ${userName} (ID: ${userId}):

${userText}

💬 Ответьте через кнопку "💬 Ответить клиенту"`;

        try {
            await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, adminKeyboard);
            await ctx.reply('✅ Сообщение передано сотруднику. Ожидайте ответа.', mainKeyboard);
        } catch (error) {
            await ctx.reply('❌ Ошибка отправки.', mainKeyboard);
        }
    }
});

// ===== ДЛЯ АДМИНА =====

// Команда /admin для админ-панели
bot.command('admin', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) {
        return ctx.reply('❌ Доступ запрещен');
    }
    showAdminPanel(ctx);
});

// Функция показа админ-панели
function showAdminPanel(ctx) {
    const activeCount = activeUsers.size;
    
    let message = `👨‍💼 ПАНЕЛЬ АДМИНИСТРАТОРА\n\n`;
    message += `👥 Клиентов в ожидании: ${activeCount}\n\n`;
    
    if (activeCount > 0) {
        message += `📋 Активные клиенты:\n`;
        let counter = 1;
        activeUsers.forEach((user, userId) => {
            message += `${counter}. ${user.userName} (${user.username})\n`;
            counter++;
        });
    } else {
        message += `📭 Нет активных клиентов`;
    }
    
    ctx.reply(message, adminKeyboard);
    adminState = { currentAction: null, selectedUser: null };
}

// Обработка кнопок админа
bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    const text = ctx.message.text;

    // Кнопка "Список клиентов"
    if (text === '📋 Список клиентов') {
        showAdminPanel(ctx);
        return;
    }

    // Кнопка "Ответить клиенту"
    if (text === '💬 Ответить клиенту') {
        if (activeUsers.size === 0) {
            return ctx.reply('📭 Нет клиентов для ответа', adminKeyboard);
        }

        adminState.currentAction = 'select_user_for_reply';
        
        let message = `💬 ВЫБЕРИТЕ КЛИЕНТА ДЛЯ ОТВЕТА:\n\n`;
        let counter = 1;
        activeUsers.forEach((user, userId) => {
            message += `${counter}. ${user.userName} (${user.username})\n`;
            counter++;
        });
        
        message += `\n📝 Напишите номер клиента (1, 2, 3...)`;
        
        await ctx.reply(message, adminCancelKeyboard);
        return;
    }

    // Кнопка "Завершить диалог"
    if (text === '❌ Завершить диалог') {
        if (activeUsers.size === 0) {
            return ctx.reply('📭 Нет активных диалогов', adminKeyboard);
        }

        adminState.currentAction = 'select_user_for_end';
        
        let message = `❌ ЗАВЕРШЕНИЕ ДИАЛОГА:\n\n`;
        let counter = 1;
        activeUsers.forEach((user, userId) => {
            message += `${counter}. ${user.userName} (${user.username})\n`;
            counter++;
        });
        
        message += `\n📝 Напишите номер клиента для завершения диалога`;
        
        await ctx.reply(message, adminCancelKeyboard);
        return;
    }

    // Кнопка "Отмена"
    if (text === '↩️ Отмена') {
        adminState = { currentAction: null, selectedUser: null };
        showAdminPanel(ctx);
        return;
    }

    // Обработка выбора клиента для ответа
    if (adminState.currentAction === 'select_user_for_reply') {
        const userNumber = parseInt(text);
        
        if (isNaN(userNumber) || userNumber < 1 || userNumber > activeUsers.size) {
            return ctx.reply('❌ Неверный номер. Выберите из списка:', adminCancelKeyboard);
        }

        // Получаем userId по номеру
        const usersArray = Array.from(activeUsers.entries());
        const [userId, userData] = usersArray[userNumber - 1];
        
        adminState = {
            currentAction: 'waiting_reply_message',
            selectedUser: userId
        };

        await ctx.reply(
            `💬 ОТВЕТ ДЛЯ: ${userData.userName} (${userData.username})\n\n📝 Напишите ваш ответ:`,
            adminCancelKeyboard
        );
        return;
    }

    // Обработка сообщения для клиента
    if (adminState.currentAction === 'waiting_reply_message') {
        const userId = adminState.selectedUser;
        
        if (!activeUsers.has(userId)) {
            adminState = { currentAction: null, selectedUser: null };
            return ctx.reply('❌ Клиент больше не активен', adminKeyboard);
        }

        const userData = activeUsers.get(userId);
        
        try {
            // Отправляем сообщение клиенту
            await bot.telegram.sendMessage(
                userId,
                `👨‍💼 Ответ от сотрудника:\n\n${text}`,
                mainKeyboard
            );
            
            await ctx.reply(`✅ Ответ отправлен ${userData.userName}`, adminKeyboard);
            
        } catch (error) {
            await ctx.reply(`❌ Ошибка отправки. Клиент заблокировал бота.`, adminKeyboard);
            activeUsers.delete(userId); // Удаляем неактивного клиента
        }
        
        adminState = { currentAction: null, selectedUser: null };
        return;
    }

    // Обработка завершения диалога
    if (adminState.currentAction === 'select_user_for_end') {
        const userNumber = parseInt(text);
        
        if (isNaN(userNumber) || userNumber < 1 || userNumber > activeUsers.size) {
            return ctx.reply('❌ Неверный номер. Выберите из списка:', adminCancelKeyboard);
        }

        // Получаем userId по номеру и удаляем
        const usersArray = Array.from(activeUsers.entries());
        const [userId, userData] = usersArray[userNumber - 1];
        
        // Отправляем уведомление клиенту
        try {
            await bot.telegram.sendMessage(
                userId,
                '💬 Диалог с сотрудником завершен. Если у вас есть еще вопросы - нажмите кнопку "📞 Обратная связь"',
                mainKeyboard
            );
        } catch (error) {
            // Игнорируем ошибку если клиент заблокировал бота
        }
        
        // Удаляем клиента из активных
        activeUsers.delete(userId);
        
        await ctx.reply(`✅ Диалог с ${userData.userName} завершен`, adminKeyboard);
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
