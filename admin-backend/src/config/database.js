// ── Database config (shared pg pool pointing to same DB as chat backend) ───
import { Pool } from 'pg';

const db = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? ''),
});

export default db;
