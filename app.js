const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const sequelize = require('./database');
const todosRouter = require('./routes/todos');
const healthRouter = require('./routes/health');

// --- Load environment variables FIRST ---
dotenv.config();

// --- AUTOMATION: Load Background Jobs ---
require('./jobs/deadlineJob');
require('./jobs/dailySummary');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(express.json());
app.use(cors({ origin: '*' })); // You can restrict this later
app.use(express.static('public'));

// --- Health Check (ALB Critical Path) ---
app.use('/health', healthRouter);

// --- API Routes ---
app.use('/api/todos', todosRouter);

// --- Root Route (Optional but useful for ALB testing) ---
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Demo Todo API is running',
        status: 'ok'
    });
});

// --- 404 Handler ---
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// --- Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('❌ [SYSTEM ERROR]', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

// --- Server Lifecycle ---
async function startServer() {
    try {
        // Database connection
        await sequelize.authenticate();
        console.log('✅ [DATABASE] Connected to PostgreSQL successfully!');

        // Sync database
        await sequelize.sync({ alter: false });
        console.log('📦 [DATABASE] Schema synced.');

        // 🚨 IMPORTANT: Bind to 0.0.0.0 (REQUIRED for Kubernetes + ALB)
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 [SERVER] Running on http://0.0.0.0:${PORT}`);
            console.log(`🩺 [HEALTH] http://0.0.0.0:${PORT}/health`);
            console.log(`📂 [STATIC] Serving frontend from /public`);
            console.log(`🤖 [BOT] Background jobs initialized`);
        });

    } catch (err) {
        console.error('❌ [CRITICAL] Failed to initialize system:', err);
        process.exit(1);
    }
}

startServer();