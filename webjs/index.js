const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();
const PORT = process.env.PORT || 3000;
const LIMIT = 100;
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
const clients = {};

// Function to send SSE updates
const sendSSEUpdate = (data) => {
  for (const id in clients) {
    const client = clients[id];
    if ((new Date(client.query.to)).getTime() <= (new Date(data.date)).getTime()
      && (new Date(client.query.from)).getTime() >= (new Date(data.date)).getTime()
      && client.query.search && data.other != client.query.search) {
      continue;
    }
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  }
};

function getRecords(query) {
  return new Promise((resolve, reject) => {
    let sql = 'SELECT * FROM sensor_data';
    const conditions = [];
    const params = [];

    // Filter by date range if provided
    if (query.from) {
      conditions.push('date >= ?');
      params.push(query.from);
    }
    if (query.to) {
      conditions.push('date <= ?');
      params.push(query.to);
    }
    // Optional text search on "other" field
    if (query.search) {
      conditions.push('other LIKE ?');
      params.push(`%${query.search}%`);
    }
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    // Order by date descending (newest first)
    sql += ' ORDER BY date DESC';

    // Pagination: limit & offset
    const limit = query.limit ? parseInt(query.limit, 10) : LIMIT;
    const offset = query.offset ? parseInt(query.offset, 10) : 0;
    sql += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    db.all(sql, params, (err, rows) => {
      // console.log(sql, params);
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Serve main page
app.get('/', async (req, res) => {
  try {
    res.locals.records = await getRecords(req.query);
    res.locals.query = req.query;
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
      res.send({ message: 'Data received and stored', data: newData });
    }
  );
});
var ids = 0;
// SSE Events Endpoint
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  let id = ids;
  ids++;
  res.query = req.query;
  clients[id] = res;

  req.on('close', () => {
    delete clients[id];
    res.end();
  });
});


// API endpoint to fetch additional records as JSON (for "load more")
app.get('/api/records', async (req, res) => {
  try {
    const records = await getRecords(req.query);
    res.send(records);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).send({ error: 'Database error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server started at http://localhost:${PORT}`);
});
