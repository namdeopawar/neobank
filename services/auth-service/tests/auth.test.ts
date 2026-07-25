import request from 'supertest';
import app from '../src/index';

describe('Auth Service', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should return 422 for invalid email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'not-an-email', password: 'Test@1234', firstName: 'John', lastName: 'Doe' });
      expect(res.status).toBe(422);
    });

    it('should return 422 for weak password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ email: 'test@example.com', password: 'weak', firstName: 'John', lastName: 'Doe' });
      expect(res.status).toBe(422);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');
      expect([200, 503]).toContain(res.status);
    });
  });
});
