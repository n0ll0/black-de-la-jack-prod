const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();
const PORT = process.env.PORT || 3000;
const LIMIT = 30;
const app = express();

// Middleware
app.use(express.static('static'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
var conns = 0;
app.use((req, res, next) => {
  console.log(req.method, req.url);
  conns++;
  console.time('Request time ' + (conns) + " " + req.ip);
  next();
  console.timeEnd('Request time ' + (conns) + " " + req.ip);
});

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';

// Initialize the database
const db = new sqlite3.Database('records.db', async (err) => {
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

// Create users table if not exists
db.run(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
`, (err) => {
    if (err) console.error('Table creation error:', err.message);
});

// Register endpoint
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
        if (err) {
            return res.status(500).json({ error: 'User already exists or database error' });
        }
        res.json({ message: 'User registered successfully' });
    });
});

// Login endpoint
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    
    db.get(`SELECT * FROM users WHERE username = ?`, [username], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        
        const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ message: 'Login successful', token });
    });
});

// Middleware for authentication
function authenticateToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'Access denied' });
    
    jwt.verify(token.split(' ')[1], SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
}

// Example protected route
app.get('/protected', authenticateToken, (req, res) => {
    res.json({ message: 'This is a protected route', user: req.user });
});

app.set('view engine', 'ejs');
app.set('views', 'views');

// Helper function to convert local datetime to UTC
function convertToUTC(dateString) {
  try {
    return (new Date(dateString)).toISOString();
  } catch (error) {
    return undefined;
  }
}
// Store connected SSE clients
const clients = {};

// Function to send SSE updates
async function sendSSEUpdate(data) {
  function dontSend(client) {
    // Filter data based on client query parameters
    const clientTo = convertToUTC(client.query.to);
    const clientFrom = convertToUTC(client.query.from);

    console.log(client.query, data);

    return (clientTo) ? clientTo <= dataDate : true
      && (clientFrom) ? clientFrom >= dataDate : true
      && client.query.search
    && data.other !== client.query.search;
  }

  const dataDate = convertToUTC(data.date);
  for (const id in clients) {
    const client = clients[id];
    if (!dontSend(client)) {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }
}

function getRecords(query) {
  return new Promise((resolve, reject) => {
    let sql = 'SELECT * FROM sensor_data';
    const conditions = [];
    const params = [];

    // Filter by date range if provided
    if (query.from) {
      const fromUTC = convertToUTC(query.from);
      conditions.push('date >= ?');
      params.push(fromUTC);
    }
    if (query.to) {
      const toUTC = convertToUTC(query.to);
      conditions.push('date <= ?');
      params.push(toUTC);
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
    res.setHeader('Content-Type', 'text/html');
    res.locals.query = req.query;
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

      res.send({ message: 'Data received and stored', data: newData });
      sendSSEUpdate(newData);
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

// Function to get the local IP address
function getLocalIPAddress() {
  const interfaces = require('os').networkInterfaces();
  for (const interfaceName in interfaces) {
    const addresses = interfaces[interfaceName];
    for (const address of addresses) {
      if (address.family === 'IPv4' && !address.internal) {
        return address.address;
      }
    }
  }
  return 'localhost';
}

// Start server
module.exports = app.listen(PORT, () => {
  console.log(`Server started at http://${getLocalIPAddress()}:${PORT}`);
});
