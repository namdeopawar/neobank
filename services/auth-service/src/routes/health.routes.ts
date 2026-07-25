import { Router, Request, Response } from 'express';
import { db } from '../db/connection';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    await db.query('SELECT 1');
    res.json({
      status: 'healthy',
      service: 'auth-service',
      version: process.env.APP_VERSION || '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      db: 'connected'
    });
  } catch {
    res.status(503).json({ status: 'unhealthy', db: 'disconnected' });
  }
});

router.get('/ready', async (req: Request, res: Response) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready' });
  }
});

export { router as healthRouter };
