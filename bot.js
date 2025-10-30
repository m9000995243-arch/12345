import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, KeyboardButton
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes

# Замените на ваш токен бота
TOKEN = "YOUR_BOT_TOKEN"
# Замените на ваш Telegram ID (ID администратора)
ADMIN_ID = 123456789

# Глобальные переменные для управления состоянием
pending_users = set()  # Множество ID пользователей, ожидающих обратной связи
current_dialog = None  # ID пользователя, с которым админ сейчас общается

# Словарь с текстами для категорий (замените на ваши тексты)
texts = {
    'доставка': 'Здесь будет текст о доставке.',  # ВПИШИТЕ СВОЙ ТЕКСТ ЗДЕСЬ
    'возврат': 'Здесь будет текст о возврате.',  # ВПИШИТЕ СВОЙ ТЕКСТ ЗДЕСЬ
    'каталог': 'Здесь будет ссылка на каталог или текст.',  # ВПИШИТЕ СВОЙ ТЕКСТ ЗДЕСЬ
    'о бренде': 'Здесь будет текст о бренде.',  # ВПИШИТЕ СВОЙ ТЕКСТ ЗДЕСЬ
}

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик команды /start для пользователей."""
    keyboard = [
        [KeyboardButton('доставка'), KeyboardButton('возврат')],
        [KeyboardButton('каталог'), KeyboardButton('о бренде')],
        [KeyboardButton('обратная связь')]
    ]
    reply_markup = ReplyKeyboardMarkup(keyboard, resize_keyboard=True)
    await update.message.reply_text('Выберите категорию:', reply_markup=reply_markup)

async def handle_button(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик нажатий на кнопки меню."""
    text = update.message.text.lower()
    if text in texts:
        await update.message.reply_text(texts[text])
    elif text == 'обратная связь':
        user_id = update.effective_user.id
        username = update.effective_user.username or f"ID: {user_id}"
        pending_users.add(user_id)
        # Уведомить админа о новом пользователе
        await notify_admin(context)

async def notify_admin(context: ContextTypes.DEFAULT_TYPE):
    """Уведомляет админа о пользователях, ожидающих обратную связь."""
    if not pending_users:
        return
    keyboard = []
    for user_id in pending_users:
        button_text = f"Пользователь {user_id}"
        keyboard.append([InlineKeyboardButton(button_text, callback_data=f"select_{user_id}")])
    reply_markup = InlineKeyboardMarkup(keyboard)
    await context.bot.send_message(chat_id=ADMIN_ID, text="Новые пользователи ждут обратной связи:", reply_markup=reply_markup)

async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик inline-кнопок для админа."""
    query = update.callback_query
    await query.answer()
    data = query.data
    global current_dialog

    if data.startswith('select_'):
        user_id = int(data.split('_')[1])
        current_dialog = user_id
        pending_users.discard(user_id)
        keyboard = [
            [InlineKeyboardButton("Ответить клиенту", callback_data="respond")],
            [InlineKeyboardButton("Выйти из диалога", callback_data="exit_dialog")],
            [InlineKeyboardButton("Завершить диалог", callback_data="end_dialog")]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await query.edit_message_text(text=f"Диалог с пользователем {user_id}. Выберите действие:", reply_markup=reply_markup)

    elif data == 'respond':
        await query.edit_message_text(text="Теперь вы можете отправлять сообщения пользователю. Они будут пересланы.")

    elif data == 'exit_dialog':
        current_dialog = None
        await query.edit_message_text(text="Вы вышли из диалога. Можете выбрать другого пользователя.")
        await notify_admin(context)

    elif data == 'end_dialog':
        user_id = current_dialog
        current_dialog = None
        pending_users.discard(user_id)
        await query.edit_message_text(text="Диалог завершен. Пользователь удален из списка.")
        await notify_admin(context)

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Обработчик текстовых сообщений."""
    user_id = update.effective_user.id

    if user_id == ADMIN_ID:
        if current_dialog:
            # Переслать сообщение админа пользователю
            await context.bot.send_message(chat_id=current_dialog, text=update.message.text)
        else:
            await update.message.reply_text("Вы не в диалоге с пользователем.")

    elif user_id == current_dialog:
        # Переслать сообщение пользователя админу
        username = update.effective_user.username or f"ID: {user_id}"
        text = f"Сообщение от {username}: {update.message.text}"
        await context.bot.send_message(chat_id=ADMIN_ID, text=text)
    else:
        # Если пользователь не в диалоге, игнорировать или предупредить
        await update.message.reply_text("Администратор сейчас занят. Попробуйте позже или нажмите 'обратная связь' снова.")

def main():
    """Главная функция."""
    application = Application.builder().token(TOKEN).build()

    # Добавляем обработчики
    application.add_handler(CommandHandler("start", start))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_button))
    application.add_handler(CallbackQueryHandler(handle_callback))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    # Запуск бота
    application.run_polling()

if __name__ == '__main__':
    main()
