const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_temporal';
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Crear tabla
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Función distancia Haversine (km)
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) *
    Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Registrar/actualizar usuario con ubicación
app.post('/api/location', async (req, res) => {
  const { name, lat, lon } = req.body;
  if (!name || !lat || !lon)
    return res.status(400).json({ error: 'Faltan datos' });

  await pool.query(`
    INSERT INTO users (name, lat, lon)
    VALUES ($1, $2, $3)
    ON CONFLICT (name)
    DO UPDATE SET lat=$2, lon=$3, updated_at=CURRENT_TIMESTAMP
  `, [name, lat, lon]);

  res.json({ ok: true });
});

// Ver usuarios cercanos
app.get('/api/nearby', async (req, res) => {
  const { lat, lon, name } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'Faltan coordenadas' });

  const result = await pool.query('SELECT * FROM users WHERE name != $1', [name || '']);
  const nearby = result.rows.map(u => ({
    name: u.name,
    distance_km: haversine(parseFloat(lat), parseFloat(lon), u.lat, u.lon).toFixed(1)
  })).sort((a, b) => a.distance_km - b.distance_km);

  res.json(nearby);
});

// Registro
app.post('/api/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name)
    return res.status(400).json({ error: 'Faltan datos' });

  const hash = await bcrypt.hash(password, 10);
  try {
    await pool.query(
      'INSERT INTO auth (email, password, name) VALUES ($1, $2, $3)',
      [email, hash, name]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Email ya registrado' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const result = await pool.query('SELECT * FROM auth WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user) return res.status(400).json({ error: 'Usuario no encontrado' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ error: 'Contraseña incorrecta' });

  const token = jwt.sign({ id: user.id, name: user.name }, JWT_SECRET);
  res.json({ token, name: user.name });
});

app.listen(3000, () => console.log('Servidor corriendo en puerto 3000'));