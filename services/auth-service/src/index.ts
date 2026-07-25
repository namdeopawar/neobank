import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import { register } from 'prom-client';
import { authRouter } from './routes/auth.routes';
import { healthRouter } from './routes/health.routes';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { db } from './db/connection';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '10kb' }));
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

app.use('/health', healthRouter);
app.use('/api/v1/auth', authRouter);

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.use(errorHandler);

async function bootstrap() {
  try {
    await db.connect();
    logger.info('Database connection established');
    app.listen(PORT, () => {
      logger.info(`Auth service running on port ${PORT}`);
    });
  } catch (err) {
    logger.error('Failed to start service', { error: err });
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  bootstrap();
}

export default app;
