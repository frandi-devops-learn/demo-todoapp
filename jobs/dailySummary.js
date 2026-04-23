const cron = require('node-cron');
const Todo = require('../models/Todo');
const sendTelegramMsg = require('../utils/telegram');

// Runs every morning at 8:30 AM (Bangkok Time)
cron.schedule('30 8 * * *', async () => {
    console.log('📊 Generating daily task summary...');

    const pendingTasks = await Todo.findAll({
        where: { completed: false },
        order: [['priority', 'DESC']]
    });

    if (pendingTasks.length === 0) {
        return sendTelegramMsg("✨ *Good morning!* Your registry is clean. No pending tasks for today.");
    }

    let summary = `📊 *Daily Status Report*\n`;
    summary += `You have *${pendingTasks.length}* tasks in the queue:\n\n`;

    pendingTasks.forEach((t, index) => {
        const prio = t.priority === 3 ? '🔴' : t.priority === 2 ? '🟡' : '🟢';
        summary += `${index + 1}. ${prio} *${t.title}*\n`;
        summary += `   🏷️ _${t.category || 'General'}_\n\n`;
    });

    summary += `_Go get 'em, Bro!_ 🚀`;

    sendTelegramMsg(summary);
}, {
    timezone: "Asia/Bangkok"
});