const cron = require('node-cron');
const { Op } = require('sequelize');
const Todo = require('../models/Todo');
const sendTelegramMsg = require('../utils/telegram');

// Runs every morning at 9:00 AM (Bangkok Time)
cron.schedule('0 9 * * *', async () => {
    console.log('🔍 Running automated deadline check...');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const urgentTasks = await Todo.findAll({
        where: {
            completed: false,
            dueDate: {
                [Op.not]: null,
                [Op.lte]: tomorrow, // Due within 24 hours
                [Op.gte]: new Date() // Not already expired
            }
        }
    });

    if (urgentTasks.length > 0) {
        let alertMsg = `*Hey bro you need to finish your task!*\n\n`;
        urgentTasks.forEach(t => {
            alertMsg += `⏰ *Deadline:* ${new Date(t.dueDate).toLocaleDateString()}\n`;
            alertMsg += `👉 _${t.title}_\n\n`;
        });
        sendTelegramMsg(alertMsg);
    }
}, {
    timezone: "Asia/Bangkok"
});