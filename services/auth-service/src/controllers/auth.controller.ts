import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

const JWT_SECRET = process.env.JWT_SECRET || 'neobank-super-secret-jwt-key-change-in-prod';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'neobank-refresh-secret-change-in-prod';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

export class AuthController {
  register = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, firstName, lastName, phone } = req.body;

      const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        throw new AppError('Email already registered', 409);
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const result = await db.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, email, first_name, last_name, role, status, created_at`,
        [email, passwordHash, firstName, lastName, phone]
      );

      const user = result.rows[0];
      await this.logAudit(user.id, 'USER_REGISTERED', req);

      logger.info('New user registered', { userId: user.id, email });
      res.status(201).json({
        message: 'Registration successful',
        user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name }
      });
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, deviceId } = req.body;

      const result = await db.query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        throw new AppError('Invalid credentials', 401);
      }

      const user = result.rows[0];

      if (user.status === 'suspended') {
        throw new AppError('Account suspended. Contact support.', 403);
      }

      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        throw new AppError('Account temporarily locked. Try again later.', 423);
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        const attempts = user.failed_login_attempts + 1;
        const lockUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        await db.query(
          'UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3',
          [attempts, lockUntil, user.id]
        );
        throw new AppError('Invalid credentials', 401);
      }

      await db.query(
        'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login = NOW() WHERE id = $1',
        [user.id]
      );

      const accessToken = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
      );

      const refreshToken = uuidv4();
      const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.query(
        `INSERT INTO refresh_tokens (user_id, token, device_id, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [user.id, refreshToken, deviceId, req.ip, req.headers['user-agent'], refreshExpiry]
      );

      await this.logAudit(user.id, 'USER_LOGIN', req);

      res.json({
        accessToken,
        refreshToken,
        expiresIn: 900,
        tokenType: 'Bearer',
        user: {
          id: user.id,
          email: user.email,
          firstName: user.first_name,
          lastName: user.last_name,
          role: user.role,
          kycVerified: user.kyc_verified
        }
      });
    } catch (err) {
      next(err);
    }
  };

  refreshToken = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) throw new AppError('Refresh token required', 400);

      const result = await db.query(
        `SELECT rt.*, u.email, u.role, u.status
         FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id
         WHERE rt.token = $1 AND rt.revoked = FALSE AND rt.expires_at > NOW()`,
        [refreshToken]
      );

      if (result.rows.length === 0) {
        throw new AppError('Invalid or expired refresh token', 401);
      }

      const tokenData = result.rows[0];
      if (tokenData.status !== 'active') {
        throw new AppError('Account is not active', 403);
      }

      const accessToken = jwt.sign(
        { userId: tokenData.user_id, email: tokenData.email, role: tokenData.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions
      );

      res.json({ accessToken, expiresIn: 900, tokenType: 'Bearer' });
    } catch (err) {
      next(err);
    }
  };

  logout = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await db.query('UPDATE refresh_tokens SET revoked = TRUE WHERE token = $1', [refreshToken]);
      }
      await this.logAudit((req as any).user.userId, 'USER_LOGOUT', req);
      res.json({ message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  };

  logoutAll = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.userId;
      await db.query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [userId]);
      await this.logAudit(userId, 'USER_LOGOUT_ALL', req);
      res.json({ message: 'Logged out from all devices' });
    } catch (err) {
      next(err);
    }
  };

  getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.userId;
      const result = await db.query(
        'SELECT id, email, first_name, last_name, phone, role, status, kyc_verified, last_login, created_at FROM users WHERE id = $1',
        [userId]
      );
      if (result.rows.length === 0) throw new AppError('User not found', 404);
      const user = result.rows[0];
      res.json({
        id: user.id, email: user.email, firstName: user.first_name,
        lastName: user.last_name, phone: user.phone, role: user.role,
        status: user.status, kycVerified: user.kyc_verified,
        lastLogin: user.last_login, createdAt: user.created_at
      });
    } catch (err) {
      next(err);
    }
  };

  changePassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).user.userId;
      const { currentPassword, newPassword } = req.body;

      const result = await db.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
      const user = result.rows[0];

      const isValid = await bcrypt.compare(currentPassword, user.password_hash);
      if (!isValid) throw new AppError('Current password is incorrect', 400);

      const newHash = await bcrypt.hash(newPassword, 12);
      await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [newHash, userId]);
      await db.query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [userId]);
      await this.logAudit(userId, 'PASSWORD_CHANGED', req);

      res.json({ message: 'Password changed successfully. Please log in again.' });
    } catch (err) {
      next(err);
    }
  };

  forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email } = req.body;
      const result = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      // Always return success to prevent email enumeration
      if (result.rows.length > 0) {
        const token = uuidv4();
        logger.info('Password reset token generated', { userId: result.rows[0].id, token });
        // In production: send email via notification service
      }
      res.json({ message: 'If the email exists, a reset link has been sent.' });
    } catch (err) {
      next(err);
    }
  };

  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ message: 'Password reset functionality - implement with token store' });
    } catch (err) {
      next(err);
    }
  };

  private logAudit = async (userId: string, action: string, req: Request) => {
    try {
      await db.query(
        'INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
        [userId, action, req.ip, req.headers['user-agent']]
      );
    } catch (err) {
      logger.error('Failed to write audit log', { error: err });
    }
  };
}
