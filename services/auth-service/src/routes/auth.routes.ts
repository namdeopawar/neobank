import { Router } from 'express';
import { body } from 'express-validator';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';

const router = Router();
const controller = new AuthController();

router.post('/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/),
    body('firstName').isLength({ min: 2, max: 100 }).trim(),
    body('lastName').isLength({ min: 2, max: 100 }).trim(),
    body('phone').optional().isMobilePhone('any'),
  ],
  validateRequest,
  controller.register
);

router.post('/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
    body('deviceId').optional().isString(),
  ],
  validateRequest,
  controller.login
);

router.post('/refresh', controller.refreshToken);
router.post('/logout', authenticate, controller.logout);
router.post('/logout-all', authenticate, controller.logoutAll);
router.get('/me', authenticate, controller.getMe);
router.post('/change-password', authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }).matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/),
  ],
  validateRequest,
  controller.changePassword
);
router.post('/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  validateRequest,
  controller.forgotPassword
);
router.post('/reset-password',
  [
    body('token').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  validateRequest,
  controller.resetPassword
);

export { router as authRouter };
