const { Telegraf, Markup } = require('telegraf');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== НАСТРОЙКИ =====
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ===== ХРАНИЛИЩЕ =====
const activeUsers = new Map(); // userId -> {userName, chatId, username}
let adminState = { 
    currentAction: null, 
    selectedUser: null,
    selectedUserName: null 
};

// ===== КЛАВИАТУРЫ =====
const mainKeyboard = Markup.keyboard([
    ['🚚 Доставка', '🔄 Возврат'],
    ['📦 Каталог', '🏢 О бренде'],
    ['📞 Обратная связь']
]).resize();

const adminMainKeyboard = Markup.keyboard([
    ['📋 Список клиентов', '💬 Ответить клиенту'],
    ['❌ Завершить диалог', '🚪 Выйти из диалога']
]).resize();

const adminDialogKeyboard = Markup.keyboard([
    ['🚪 Завершить и выйти']
]).resize();

// ===== ТЕКСТ ДЛЯ КНОПОК (ЗАПОЛНИ ЭТО САМ) =====

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

Нажмите "💬 Ответить клиенту" для начала диалога`;

    try {
        await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, adminMainKeyboard);
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
    if (activeUsers.has(userId) && !['🚚 Доставка', '🔄 Возврат', '📦 Каталог', '🏢 О бренде', '📞 Обратная связь'].includes(userText)) {
        
        // Если админ в диалоге с этим пользователем - сразу пересылаем
        if (adminState.selectedUser === userId) {
            try {
                await bot.telegram.sendMessage(ADMIN_CHAT_ID, `👤 ${userName}: ${userText}`, adminDialogKeyboard);
                await ctx.reply('✅ Сообщение доставлено', mainKeyboard);
            } catch (error) {
                await ctx.reply('❌ Ошибка отправки.', mainKeyboard);
            }
        } else {
            // Если админ не в диалоге - отправляем уведомление
            const adminMessage = 
`📨 Сообщение от ${userName} (${activeUsers.get(userId).username}):

${userText}

Нажмите "💬 Ответить клиенту" для ответа`;

            try {
                await bot.telegram.sendMessage(ADMIN_CHAT_ID, adminMessage, adminMainKeyboard);
                await ctx.reply('✅ Сообщение передано сотруднику. Ожидайте ответа.', mainKeyboard);
            } catch (error) {
                await ctx.reply('❌ Ошибка отправки.', mainKeyboard);
            }
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
    message += `👥 Клиентов в ожидании: ${activeCount}\n`;
    
    if (adminState.selectedUser) {
        message += `💬 В диалоге с: ${adminState.selectedUserName}\n`;
    }
    
    if (activeCount > 0) {
        message += `\n📋 Активные клиенты:\n`;
        let counter = 1;
        activeUsers.forEach((user, userId) => {
            const status = adminState.selectedUser === userId ? '✅ В ДИАЛОГЕ' : '⏳ ОЖИДАЕТ';
            message += `${counter}. ${user.userName} (${user.username}) - ${status}\n`;
            counter++;
        });
    } else {
        message += `\n📭 Нет активных клиентов`;
    }
    
    ctx.reply(message, adminMainKeyboard);
}

// Обработка ВСЕХ сообщений админа
bot.on('text', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_CHAT_ID) return;
    
    const text = ctx.message.text;

    // === ЕСЛИ АДМИН В ДИАЛОГЕ ===
    if (adminState.selectedUser && adminState.currentAction === 'in_dialog') {
        
        // Кнопка "Завершить и выйти"
        if (text === '🚪 Завершить и выйти') {
            const userName = adminState.selectedUserName;
            adminState = { currentAction: null, selectedUser: null, selectedUserName: null };
            
            // Уведомляем пользователя
            try {
                await bot.telegram.sendMessage(
                    adminState.selectedUser,
                    '💬 Диалог с сотрудником завершен. Если у вас есть еще вопросы - нажмите кнопку "📞 Обратная связь"',
                    mainKeyboard
                );
            } catch (error) {
                // Игнорируем ошибку
            }
            
            // Удаляем пользователя из активных
            activeUsers.delete(adminState.selectedUser);
            
            await ctx.reply(`✅ Диалог с ${userName} завершен`, adminMainKeyboard);
            showAdminPanel(ctx);
            return;
        }
        
        // Любое другое сообщение - отправляем пользователю
        try {
            await bot.telegram.sendMessage(
                adminState.selectedUser,
                `👨‍💼 Ответ от сотрудника:\n\n${text}`,
                mainKeyboard
            );
            await ctx.reply('✅ Сообщение отправлено', adminDialogKeyboard);
        } catch (error) {
            await ctx.reply('❌ Ошибка отправки. Клиент заблокировал бота.', adminMainKeyboard);
            activeUsers.delete(adminState.selectedUser);
            adminState = { currentAction: null, selectedUser: null, selectedUserName: null };
            showAdminPanel(ctx);
        }
        return;
    }

    // === ЕСЛИ АДМИН НЕ В ДИАЛОГЕ ===

    // Кнопка "Список клиентов"
    if (text === '📋 Список клиентов') {
        showAdminPanel(ctx);
        return;
    }

    // Кнопка "Ответить клиенту"
    if (text === '💬 Ответить клиенту') {
        if (activeUsers.size === 0) {
            return ctx.reply('📭 Нет клиентов для ответа', adminMainKeyboard);
        }

        // Если всего один клиент - сразу начинаем диалог
        if (activeUsers.size === 1) {
            const [userId, userData] = Array.from(activeUsers.entries())[0];
            adminState = {
                currentAction: 'in_dialog',
                selectedUser: userId,
                selectedUserName: userData.userName
            };
            
            await ctx.reply(
                `💬 ДИАЛОГ С: ${userData.userName} (${userData.username})\n\nПишите сообщения - они будут отправляться клиенту автоматически.\n\nДля выхода нажмите "🚪 Завершить и выйти"`,
                adminDialogKeyboard
            );
            return;
        }

        // Если несколько клиентов - показываем список
        adminState.currentAction = 'select_user';
        
        let message = `💬 ВЫБЕРИТЕ КЛИЕНТА ДЛЯ ОТВЕТА:\n\n`;
        let counter = 1;
        const usersArray = Array.from(activeUsers.entries());
        
        usersArray.forEach(([userId, userData], index) => {
            message += `${counter}. ${userData.userName} (${userData.username})\n`;
            counter++;
        });
        
        await ctx.reply(message, adminMainKeyboard);
        return;
    }

    // Кнопка "Завершить диалог"
    if (text === '❌ Завершить диалог') {
        if (activeUsers.size === 0) {
            return ctx.reply('📭 Нет активных диалогов', adminMainKeyboard);
        }

        // Если всего один клиент - сразу завершаем
        if (activeUsers.size === 1) {
            const [userId, userData] = Array.from(activeUsers.entries())[0];
            
            // Уведомляем пользователя
            try {
                await bot.telegram.sendMessage(
                    userId,
                    '💬 Диалог с сотрудником завершен. Если у вас есть еще вопросы - нажмите кнопку "📞 Обратная связь"',
                    mainKeyboard
                );
            } catch (error) {
                // Игнорируем ошибку
            }
            
            // Удаляем пользователя
            activeUsers.delete(userId);
            await ctx.reply(`✅ Диалог с ${userData.userName} завершен`, adminMainKeyboard);
            return;
        }

        // Если несколько клиентов - показываем список для завершения
        adminState.currentAction = 'end_dialog';
        
        let message = `❌ ВЫБЕРИТЕ КЛИЕНТА ДЛЯ ЗАВЕРШЕНИЯ:\n\n`;
        let counter = 1;
        const usersArray = Array.from(activeUsers.entries());
        
        usersArray.forEach(([userId, userData], index) => {
            message += `${counter}. ${userData.userName} (${userData.username})\n`;
            counter++;
        });
        
        await ctx.reply(message, adminMainKeyboard);
        return;
    }

    // Кнопка "Выйти из диалога"
    if (text === '🚪 Выйти из диалога') {
        if (adminState.selectedUser) {
            const userName = adminState.selectedUserName;
            adminState = { currentAction: null, selectedUser: null, selectedUserName: null };
            await ctx.reply(`✅ Вы вышли из диалога с ${userName}`, adminMainKeyboard);
        } else {
            await ctx.reply('❌ Вы не в диалоге', adminMainKeyboard);
        }
        return;
    }

    // Обработка выбора клиента по номеру
    if (adminState.currentAction === 'select_user' || adminState.currentAction === 'end_dialog') {
        const userNumber = parseInt(text);
        const usersArray = Array.from(activeUsers.entries());
        
        if (isNaN(userNumber) || userNumber < 1 || userNumber > usersArray.length) {
            adminState.currentAction = null;
            return ctx.reply('❌ Неверный номер', adminMainKeyboard);
        }

        const [userId, userData] = usersArray[userNumber - 1];

        if (adminState.currentAction === 'select_user') {
            // Начинаем диалог
            adminState = {
                currentAction: 'in_dialog',
                selectedUser: userId,
                selectedUserName: userData.userName
            };
            
            await ctx.reply(
                `💬 ДИАЛОГ С: ${userData.userName} (${userData.username})\n\nПишите сообщения - они будут отправляться клиенту автоматически.\n\nДля выхода нажмите "🚪 Завершить и выйти"`,
                adminDialogKeyboard
            );
        } else {
            // Завершаем диалог
            try {
                await bot.telegram.sendMessage(
                    userId,
                    '💬 Диалог с сотрудником завершен. Если у вас есть еще вопросы - нажмите кнопку "📞 Обратная связь"',
                    mainKeyboard
                );
            } catch (error) {
                // Игнорируем ошибку
            }
            
            activeUsers.delete(userId);
            adminState.currentAction = null;
            await ctx.reply(`✅ Диалог с ${userData.userName} завершен`, adminMainKeyboard);
        }
        return;
    }

    // Если админ пишет что-то другое
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
