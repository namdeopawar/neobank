import { Pool } from 'pg';
import { logger } from '../utils/logger';

export const db = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'neobank_auth',
  user: process.env.DB_USER || 'neobank',
  password: process.env.DB_PASSWORD || 'neobank_secret',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

db.on('error', (err) => {
  logger.error('Unexpected database error', { error: err });
});
