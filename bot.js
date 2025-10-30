import logging
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Updater,
    CommandHandler,
    CallbackQueryHandler,
    MessageHandler,
    Filters,
    CallbackContext,
)

# Включите логирование
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO
)
logger = logging.getLogger(__name__)

# --- КОНФИГУРАЦИЯ ---
BOT_TOKEN = "ВАШ_ТОКЕН_БОТА"  # Вставьте сюда ваш токен бота
ADMIN_CHAT_ID = "ВАШ_TELEGRAM_ID"  # Вставьте сюда ID администратора

# --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
# Словарь для хранения активных диалогов с покупателями
# Формат: {user_id: {'username': 'имя_пользователя', 'chat_id': chat_id_покупателя}}
active_dialogues = {}

# --- ОСНОВНЫЕ ФУНКЦИИ ---

def start(update: Update, context: CallbackContext) -> None:
    """Отправляет главное меню при команде /start."""
    keyboard = [
        [
            InlineKeyboardButton("Доставка", callback_data="delivery"),
            InlineKeyboardButton("Возврат", callback_data="return"),
        ],
        [
            InlineKeyboardButton("Каталог", callback_data="catalog"),
            InlineKeyboardButton("О бренде", callback_data="about_brand"),
        ],
        [InlineKeyboardButton("Обратная связь", callback_data="feedback")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    update.message.reply_text('Добро пожаловать! Выберите интересующий вас раздел:', reply_markup=reply_markup)

def button_callback(update: Update, context: CallbackContext) -> None:
    """Обрабатывает нажатия на кнопки."""
    query = update.callback_query
    query.answer()  # Отвечаем на callback query, чтобы убрать "загрузку" на кнопке

    data = query.data

    if data == "delivery":
        # --- ВСТАВЬТЕ ТЕКСТ ДЛЯ ДОСТАВКИ ЗДЕСЬ ---
        text_to_send = "Здесь информация о доставке..."
        # -----------------------------------------
        query.edit_message_text(text=text_to_send)
    elif data == "return":
        # --- ВСТАВЬТЕ ТЕКСТ ДЛЯ ВОЗВРАТА ЗДЕСЬ ---
        text_to_send = "Здесь информация о возврате..."
        # -------------------------------------------
        query.edit_message_text(text=text_to_send)
    elif data == "catalog":
        # --- ВСТАВЬТЕ ТЕКСТ ДЛЯ КАТАЛОГА ЗДЕСЬ ---
        text_to_send = "Вот наш каталог: [ссылка на каталог]..."
        # ------------------------------------------
        query.edit_message_text(text=text_to_send)
    elif data == "about_brand":
        # --- ВСТАВЬТЕ ТЕКСТ О БРЕНДЕ ЗДЕСЬ ---
        text_to_send = "Мы - [название бренда], мы..."
        # ---------------------------------------
        query.edit_message_text(text=text_to_send)
    elif data == "feedback":
        handle_feedback(query.message.chat_id, query.from_user)
    elif data == "reply_to_client":
        handle_reply_to_client(query.message.chat_id, context, query.from_user.id)
    elif data == "end_dialog":
        handle_end_dialog(query.message.chat_id, context, query.from_user.id)
    elif data.startswith("select_dialog_"):
        user_id_to_dialog = data.split("_")[2]
        handle_select_dialog(query.message.chat_id, context, user_id_to_dialog)
    elif data == "exit_dialog":
        handle_exit_dialog(query.message.chat_id, context, query.from_user.id)

def handle_feedback(chat_id: int, user) -> None:
    """Обрабатывает обратную связь от пользователя."""
    user_id = user.id
    username = user.username if user.username else f"ID_{user_id}"

    if user_id not in active_dialogues:
        active_dialogues[user_id] = {'username': username, 'chat_id': chat_id}
        logger.info(f"Новый запрос обратной связи от {username} (ID: {user_id})")

        # Отправляем сообщение администратору
        send_admin_notification(context, f"Поступил новый запрос обратной связи от: @{username}")

        # Отправляем пользователю подтверждение
        context.bot.send_message(
            chat_id=chat_id,
            text="Ваше сообщение получено. Скоро с вами свяжется наш специалист."
        )
    else:
        context.bot.send_message(
            chat_id=chat_id,
            text="Мы уже обрабатываем ваш запрос. Пожалуйста, подождите."
        )

def send_admin_notification(context: CallbackContext, message_text: str) -> None:
    """Отправляет уведомление администратору."""
    keyboard = []
    if active_dialogues:
        for user_id, info in active_dialogues.items():
            keyboard.append([InlineKeyboardButton(f"Диалог с @{info['username']}", callback_data=f"select_dialog_{user_id}")])
        keyboard.append([InlineKeyboardButton("Выйти из диалога", callback_data="exit_dialog")]) # Кнопка для администратора
        reply_markup = InlineKeyboardMarkup(keyboard)
        context.bot.send_message(
            chat_id=ADMIN_CHAT_ID,
            text=message_text,
            reply_markup=reply_markup
        )
    else:
        context.bot.send_message(
            chat_id=ADMIN_CHAT_ID,
            text=message_text
        )

def handle_select_dialog(admin_chat_id: int, context: CallbackContext, user_id_to_dialog: str) -> None:
    """Переводит администратора в режим диалога с выбранным пользователем."""
    if user_id_to_dialog in active_dialogues:
        target_user_info = active_dialogues[user_id_to_dialog]
        target_user_chat_id = target_user_info['chat_id']
        target_username = target_user_info['username']

        # Отправляем администратору сообщение для начала диалога
        keyboard_admin = [
            [InlineKeyboardButton("Завершить диалог", callback_data="end_dialog")],
            [InlineKeyboardButton("Выйти из диалога", callback_data="exit_dialog")]
        ]
        reply_markup_admin = InlineKeyboardMarkup(keyboard_admin)
        context.bot.send_message(
            chat_id=admin_chat_id,
            text=f"Вы начали диалог с @{target_username}. Введите ваше сообщение ниже:",
            reply_markup=reply_markup_admin
        )

        # Отправляем пользователю сообщение о том, что с ним связывается специалист
        context.bot.send_message(
            chat_id=target_user_chat_id,
            text="С вами связался наш специалист. Пожалуйста, ожидайте."
        )

        # Устанавливаем флаг для режима диалога с этим пользователем
        context.user_data['in_dialog_with'] = user_id_to_dialog
        context.user_data['dialog_admin_chat_id'] = admin_chat_id
    else:
        context.bot.send_message(
            chat_id=admin_chat_id,
            text="Этот диалог уже завершен или неактивен."
        )

def handle_reply_to_client(admin_chat_id: int, context: CallbackContext, admin_user_id: int) -> None:
    """Переключает бота в режим ожидания ответа администратора."""
    if 'in_dialog_with' in context.user_data and context.user_data['dialog_admin_chat_id'] == admin_chat_id:
        context.bot.send_message(
            chat_id=admin_chat_id,
            text="Напишите ваш ответ клиенту:"
        )
        # Устанавливаем состояние для ожидания сообщения от администратора
        context.user_data['awaiting_admin_reply'] = True
    else:
        context.bot.send_message(
            chat_id=admin_chat_id,
            text="Пожалуйста, сначала выберите диалог для ответа."
        )

def admin_message_handler(update: Update, context: CallbackContext) -> None:
    """Обрабатывает сообщения от администратора в режиме диалога."""
    if update.message and update.message.chat_id == int(ADMIN_CHAT_ID):
        if 'awaiting_admin_reply' in context.user_data and context.user_data['awaiting_admin_reply']:
            # Отправляем сообщение клиенту
            client_user_id = context.user_data['in_dialog_with']
            client_chat_id = active_dialogues[client_user_id]['chat_id']
            message_to_client = update.message.text

            context.bot.send_message(
                chat_id=client_chat_id,
                text=f"Ответ специалиста: {message_to_client}"
            )

            # Отправляем администратору подтверждение и кнопки
            keyboard_admin = [
                [InlineKeyboardButton("Завершить диалог", callback_data="end_dialog")],
                [InlineKeyboardButton("Выйти из диалога", callback_data="exit_dialog")]
            ]
            reply_markup_admin = InlineKeyboardMarkup(keyboard_admin)
            context.bot.send_message(
                chat_id=ADMIN_CHAT_ID,
                text=f"Ваше сообщение отправлено клиенту @{active_dialogues[client_user_id]['username']}. Введите следующий ответ или завершите диалог:",
                reply_markup=reply_markup_admin
            )

            # Сбрасываем состояние ожидания
            context.user_data['awaiting_admin_reply'] = False
        elif 'in_dialog_with' in context.user_data and context.user_data['dialog_admin_chat_id'] == update.message.chat_id:
            # Если администратор написал что-то, когда не в режиме ожидания ответа
            context.bot.send_message(
                chat_id=ADMIN_CHAT_ID,
                text="Чтобы ответить клиенту, нажмите кнопку 'Ответить клиенту'."
            )


def handle_end_dialog(admin_chat_id: int, context: CallbackContext, admin_user_id: int) -> None:
    """Завершает диалог с пользователем."""
    if 'in_dialog_with' in context.user_data and context.user_data['dialog_admin_chat_id'] == admin_chat_id:
        user_id_to_end = context.user_data['in_dialog_with']

        if user_id_to_end in active_dialogues:
            client_chat_id = active_dialogues[user_id_to_end]['chat_id']
            client_username = active_dialogues[user_id_to_end]['username']

            context.bot.send_message(
                chat_id=client_chat_id,
                text="Спасибо за обращение! Если у вас возникнут новые вопросы, обращайтесь."
            )
            context.bot.send_message(
                chat_id=admin_chat_id,
                text=f"Диалог с @{client_username} завершен."
            )

            # Удаляем пользователя из активных диалогов
            del active_dialogues[user_id_to_end]
            logger.info(f"Диалог с {client_username} (ID: {user_id_to_end}) завершен администратором.")

            # Сбрасываем состояние диалога у администратора
            context.user_data.pop('in_dialog_with', None)
            context.user_data.pop('dialog_admin_chat_id', None)
            context.user_data.pop('awaiting_admin_reply', None)

            # Обновляем уведомление для администратора
            send_admin_notification(context, "Диалог завершен.")
        else:
            context.bot.send_message(
                chat_id=admin_chat_id,
                text="Этот диалог уже неактивен."
            )
    else:
        context.bot.send_message(
            chat_id=admin_chat_id,
            text="Вы не находитесь в активном диалоге."
        )

def handle_exit_dialog(admin_chat_id: int, context: CallbackContext, admin_user_id: int) -> None:
    """Выход из текущего диалога (если активен) или просто сброс состояния."""
    if 'in_dialog_with' in context.user_data and context.user_data['dialog_admin_chat_id'] == admin_chat_id:
        user_id_to_exit = context.user_data['in_dialog_with']
        client_username = active_dialogues[user_id_to_exit]['username']

        context.bot.send_message(
            chat_id=admin_chat_id,
            text=f"Вы вышли из диалога с @{client_username}."
        )
        # Сбрасываем состояние диалога у администратора
        context.user_data.pop('in_dialog_with', None)
        context.user_data.pop('dialog_admin_chat_id', None)
        context.user_data.pop('awaiting_admin_reply', None)

        # Обновляем уведомление для администратора
        send_admin_notification(context, f"Администратор вышел из диалога с @{client_username}.")
    else:
        context.bot.send_message(
            chat_id=admin_chat_id,
            text="Вы не находитесь в активном диалоге."
        )

def main() -> None:
    """Запускает бота."""
    updater = Updater(BOT_TOKEN)

    dispatcher = updater.dispatcher

    # Обработчики команд
    dispatcher.add_handler(CommandHandler("start", start))

    # Обработчик нажатий на inline кнопки
    dispatcher.add_handler(CallbackQueryHandler(button_callback))

    # Обработчик сообщений от администратора (для диалогов)
    dispatcher.add_handler(MessageHandler(Filters.text & ~Filters.command, admin_message_handler))

    # Запуск бота
    updater.start_polling()
    logger.info("Бот запущен.")
    updater.idle()

if __name__ == '__main__':
    main()
