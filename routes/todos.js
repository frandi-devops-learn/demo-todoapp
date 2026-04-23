const express = require('express');
const router = express.Router();
const Todo = require('../models/Todo'); 
const sendTelegramMsg = require('../utils/telegram');

// 1. GET all todos
router.get('/', async (req, res) => {
  try {
    const todos = await Todo.findAll({ order: [['id', 'DESC']] });
    res.json(todos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// 2. POST a new todo
router.post('/', async (req, res) => {
  try {
    const todo = await Todo.create(req.body);
    res.status(201).json(todo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// 3. PATCH update todo (The Telegram Trigger)
router.patch('/:id', async (req, res) => {
  try {
    const todo = await Todo.findByPk(req.params.id);
    if (!todo) return res.status(404).json({ message: 'Task not found' });

    const wasCompleted = todo.completed;
    await todo.update(req.body);

    if (!wasCompleted && req.body.completed === true) {
      const message = `*Yeah Bro you did it!* 🎉\n\n` +
                      `✅ *Task:* ${todo.title}\n` +
                      `🏷️ *Category:* ${todo.category || 'General'}`;
      
      sendTelegramMsg(message);
    }

    res.json(todo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// 4. DELETE all completed (Registry Cleanup)
// --- CRITICAL: This MUST stay above the /:id route ---
router.delete('/clear-completed', async (req, res) => {
    try {
        await Todo.destroy({ where: { completed: true } });
        res.json({ message: 'Finished tasks cleared' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// 5. DELETE a specific todo
router.delete('/:id', async (req, res) => {
  try {
    const todo = await Todo.findByPk(req.params.id);
    if (todo) {
      await todo.destroy();
      res.json({ message: 'Task purged' });
    } else {
      res.status(404).json({ message: 'Task not found' });
    }
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;