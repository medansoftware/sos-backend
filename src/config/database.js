import { Sequelize } from 'sequelize';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(dataDir, 'database.sqlite'),
  logging: false, // Matikan log SQL mentah agar console bersih
});

// Aktifkan WAL mode agar SQLite lebih tahan terhadap baca/tulis bersamaan
await sequelize.query('PRAGMA journal_mode = WAL;');

export default sequelize;