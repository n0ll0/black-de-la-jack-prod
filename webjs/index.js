const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();
const PORT = process.env.PORT || 3000;
const app = express();

// Middleware
app.use(express.static('static'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', 'views');

// Initialize the database
const db = new sqlite3.Database('records.db', (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        db.run(`
            CREATE TABLE IF NOT EXISTS sensor_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                temperature REAL NOT NULL,
                humidity REAL NOT NULL,
                other TEXT NULL
            )`, (err) => {
            if (err) console.error('Table creation error:', err.message);
        });
    }
});

// Store connected SSE clients
const clients = [];

// Function to send SSE updates
const sendSSEUpdate = (data) => {
    clients.forEach(client => client.res.write(`data: ${JSON.stringify(data)}\n\n`));
};

// Fetch records
const getRecords = (query) => {
    return new Promise((resolve, reject) => {
        let sql = 'SELECT * FROM sensor_data ORDER BY id DESC LIMIT 20';
        db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

// Serve main page
app.get('/', async (req, res) => {
    try {
        res.locals.records = await getRecords(req.query);
        res.render('index');
    } catch (error) {
        console.error('Error fetching records:', error);
        res.status(500).send('Database error');
    }
});

// JSON API for inserting data
app.post('/json', async (req, res) => {
    const { date, temperature, humidity, other } = req.body;

    if (!date || temperature == null || humidity == null) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    db.run(
        `INSERT INTO sensor_data (date, temperature, humidity, other) VALUES (?, ?, ?, ?)`,
        [date, temperature, humidity, other || 'N/A'],
        function (err) {
            if (err) {
                console.error('Insert error:', err.message);
                return res.status(500).json({ error: 'Database error' });
            }

            const newData = {
                id: this.lastID,
                date,
                temperature,
                humidity,
                other: other || 'N/A'
            };

            sendSSEUpdate(newData);
            res.json({ message: 'Data received and stored', data: newData });
        }
    );
});

// SSE Events Endpoint
app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    clients.push({ res });

    req.on('close', () => {
        const index = clients.findIndex(client => client.res === res);
        if (index !== -1) clients.splice(index, 1);
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server started at http://localhost:${PORT}`);
});
