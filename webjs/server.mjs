import fs from 'fs';
import dotenv from 'dotenv';
import express from 'express';
import sqlite3 from 'sqlite3';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { networkInterfaces } from 'os';
dotenv.config();

const DB_PATH = process.env.DB_PATH || './db/records.db';
const SECRET_KEY = process.env.JWT_SECRET || 'your_secret_key';
const PORT = process.env.PORT || 3000;
const LIMIT = 50;
const app = express();

// Middleware
app.use(express.static('static', {
  extensions: ['html'],
}));
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


// Initialize the database
const db = new sqlite3.Database(DB_PATH, async (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    throw err;
  }
  console.log('Connected to SQLite database.');
  db.run(fs.readFileSync('./db/scripts/users/init.sql').toString(), (err) => {
    if (err) {
      console.error('Table creation error:', err.message);
      throw err;
    }
  });
  db.run(fs.readFileSync('./db/scripts/sensor_data/init.sql').toString(), (err) => {
    if (err) {
      console.error('Table creation error:', err.message);
      throw err;
    }
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

async function getRecords(query) {
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
app.post('/json', authenticateToken, async (req, res) => {
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


// Register endpoint
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  db.run(`INSERT INTO users (username, email, password) VALUES (?, ?, ?)`, [username, email, hashedPassword], function (err) {
    if (err) {
      console.error(err);
      if (err.code === 'SQLITE_CONSTRAINT') {
        return res.status(409).json({ message: 'User already exists' });
      } else {
        return res.status(500).json({ message: 'Database error' });
      }
    }
    res.json({ message: 'User registered successfully' });
  });
});

// Login endpoint
app.post('/api/signin', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
    if (err || !user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET_KEY, { expiresIn: '1D' });
    res.json({ message: 'Login successful', token });
  });
});

// Function to get the local IP address
function getLocalIPAddress() {
  const interfaces = networkInterfaces();
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
export default app.listen(PORT, () => {
  console.log(`Server started at http://${getLocalIPAddress()}:${PORT}`);
});
