import request from 'supertest';
import express from 'express';
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import tagRouter from '../routes/tagRoutes.js';
import * as authModule from '../middleware/auth.js';

const app = express();
app.use(express.json());
app.use('/api/tags', tagRouter);

describe('Tag Routes Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST / (create tag)', () => {
    it('should return 401 Unauthorized if no token provided', async () => {
      const response = await request(app)
        .post('/api/tags/')
        .send({
          tag: 'newuser',
          stellarAddress: 'GBRPYHIL2CI2IXDUW2YNAE3TYMHJJ3YXLR5RQPJ2XHZKXHIQF7Z4LLX'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Access token required');
    });

    it('should create tag when authenticated', async () => {
      jest.spyOn(authModule, 'authenticate').mockImplementation((req, res, next) => {
        req.user = { id: 1, username: 'testuser', email: 'test@example.com' };
        next();
      });

      const response = await request(app)
        .post('/api/tags/')
        .set('Authorization', 'Bearer valid-token')
        .send({
          tag: 'newuser',
          stellarAddress: 'GBRPYHIL2CI2IXDUW2YNAE3TYMHJJ3YXLR5RQPJ2XHZKXHIQF7Z4LLX'
        });

      expect(response.status).not.toBe(401);
    });
  });

  describe('GET /check/:tag (tag availability)', () => {
    it('should allow unauthenticated access to check endpoint', async () => {
      const response = await request(app)
        .get('/api/tags/check/testuser')
        .send();

      expect(response.status).not.toBe(401);
    });
  });

  describe('GET /:tag (resolve tag)', () => {
    it('should allow unauthenticated access to resolve endpoint', async () => {
      const response = await request(app)
        .get('/api/tags/testuser')
        .send();

      expect(response.status).not.toBe(401);
    });
  });

  describe('PUT /:tag/transfer', () => {
    it('should return 401 Unauthorized if no token provided', async () => {
      const response = await request(app)
        .put('/api/tags/myuser/transfer')
        .send({
          newStellarAddress: 'GBRPYHIL2CI2IXDUW2YNAE3TYMHJJ3YXLR5RQPJ2XHZKXHIQF7Z4LLX'
        });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Access token required');
    });

    it('should transfer tag when authenticated', async () => {
      jest.spyOn(authModule, 'authenticate').mockImplementation((req, res, next) => {
        req.user = { id: 1, username: 'testuser', email: 'test@example.com' };
        next();
      });

      const response = await request(app)
        .put('/api/tags/myuser/transfer')
        .set('Authorization', 'Bearer valid-token')
        .send({
          newStellarAddress: 'GBRPYHIL2CI2IXDUW2YNAE3TYMHJJ3YXLR5RQPJ2XHZKXHIQF7Z4LLX'
        });

      expect(response.status).not.toBe(401);
    });
  });
});
