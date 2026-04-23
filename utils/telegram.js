const axios = require('axios');
require('dotenv').config();

const sendTelegramMsg = async (message) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error('❌ Telegram Alert Failed:', error.response?.data || error.message);
  }
};

module.exports = sendTelegramMsg;