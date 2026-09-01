import request from 'supertest';
import express from 'express';
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockAuthenticate = jest.fn((req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ error: 'Access token required' });
  }
  req.user = { id: 1, username: 'testuser', email: 'test@example.com' };
  return next();
});

jest.unstable_mockModule('../middleware/auth.js', () => ({
  authenticate: mockAuthenticate,
}));

jest.unstable_mockModule('../controllers/TagController.js', () => ({
  default: {
    create: (req, res) => res.status(201).json({ ok: true, tag: req.body.tag }),
    check: (req, res) => res.status(200).json({ available: true, tag: req.params.tag }),
    resolve: (req, res) => res.status(200).json({ tag: req.params.tag }),
    transfer: (req, res) => res.status(200).json({ ok: true, tag: req.params.tag }),
    search: (req, res) => res.status(200).json([]),
  },
}));

const { default: tagRouter } = await import('../routes/tagRoutes.js');

const app = express();
app.use(express.json());
app.use('/api/tags', tagRouter);

describe('Tag Routes Authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST / (create tag)', () => {
    it('should create tag', async () => {
      const response = await request(app)
        .post('/api/tags/')
        .send({
          tag: 'newuser',
          stellarAddress: 'GBRPYHIL2CI2IXDUW2YNAE3TYMHJJ3YXLR5RQPJ2XHZKXHIQF7Z4LLX'
        });

      expect(response.status).toBe(201);
    });
  });

  describe('GET /check/:tag (tag availability)', () => {
    it('should allow unauthenticated access to check endpoint', async () => {
      const response = await request(app).get('/api/tags/check/testuser').send();
      expect(response.status).not.toBe(401);
    });
  });

  describe('GET /:tag (resolve tag)', () => {
    it('should allow unauthenticated access to resolve endpoint', async () => {
      const response = await request(app).get('/api/tags/testuser').send();
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
      const response = await request(app)
        .put('/api/tags/myuser/transfer')
        .set('Authorization', 'Bearer valid-token')
        .send({
          newStellarAddress: 'GBRPYHIL2CI2IXDUW2YNAE3TYMHJJ3YXLR5RQPJ2XHZKXHIQF7Z4LLX'
        });

      expect(response.status).toBe(200);
    });
  });
});
