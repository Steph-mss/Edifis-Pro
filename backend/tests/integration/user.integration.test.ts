import request from 'supertest';
import app from '../../server';
import { sequelize } from '../../models'; // Import sequelize instance
import { User } from '../../models';
import jwt from 'jsonwebtoken';

describe('User Integration Tests', () => {
  afterAll(async () => {
    await sequelize.close();
  });

  describe('GET /api/users/all', () => {
    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/users/all');
      expect(res.statusCode).toEqual(401);
    });

    it('should return a list of users when authenticated', async () => {
      // Mock User.findAll to return some dummy users
      (User.findAll as jest.Mock) = jest.fn().mockResolvedValue([
        { user_id: 1, firstname: 'John', lastname: 'Doe', email: 'john.doe@example.com' },
        { user_id: 2, firstname: 'Jane', lastname: 'Smith', email: 'jane.smith@example.com' },
      ]);

      const token = jwt.sign(
        { id: 1, email: 'admin@test.com', role: 'Admin' },
        process.env.JWT_SECRET || 'test_secret',
        { expiresIn: '1h' },
      );

      const res = await request(app)
        .get('/api/users/all')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body).toBeInstanceOf(Array);
    });
  });
});
