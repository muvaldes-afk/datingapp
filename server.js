const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');

const app = express();
const db = new Database('dating.db');

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Crear tabla
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
app.post('/api/location', (req, res) => {
  const { name, lat, lon } = req.body;
  if (!name || !lat || !lon)
    return res.status(400).json({ error: 'Faltan datos' });

  const existing = db.prepare('SELECT id FROM users WHERE name = ?').get(name);
  if (existing) {
    db.prepare('UPDATE users SET lat=?, lon=?, updated_at=CURRENT_TIMESTAMP WHERE name=?')
      .run(lat, lon, name);
  } else {
    db.prepare('INSERT INTO users (name, lat, lon) VALUES (?, ?, ?)')
      .run(name, lat, lon);
  }
  res.json({ ok: true });
});

// Ver usuarios cercanos
app.get('/api/nearby', (req, res) => {
  const { lat, lon, name } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'Faltan coordenadas' });

  const users = db.prepare('SELECT * FROM users WHERE name != ?').all(name || '');
  const nearby = users.map(u => ({
    name: u.name,
    distance_km: haversine(parseFloat(lat), parseFloat(lon), u.lat, u.lon).toFixed(1)
  })).sort((a, b) => a.distance_km - b.distance_km);

  res.json(nearby);
});

app.listen(3000, () => console.log('Servidor corriendo en puerto 3000'));