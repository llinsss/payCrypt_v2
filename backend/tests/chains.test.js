const request = require('supertest');
const app = require('../app');
const { generateToken } = require('../utils/token');

describe('Chain configuration routes', () => {
  const adminToken = generateToken({ id: 1, role: 'admin' });
  const userToken = generateToken({ id: 2, role: 'user' });

  describe('GET /chains', () => {
    it('allows public access to list chains', async () => {
      const res = await request(app).get('/chains');
      expect(res.status).toBe(200);
    });

    it('allows public access to a single chain', async () => {
      const res = await request(app).get('/chains/1');
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('POST /chains', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const res = await request(app).post('/chains').send({ name: 'test' });
      expect(res.status).toBe(401);
    });

    it('returns 403 for authenticated non-admin requests', async () => {
      const res = await request(app)
        .post('/chains')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'test' });
      expect(res.status).toBe(403);
    });

    it('allows admin requests', async () => {
      const res = await request(app)
        .post('/chains')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'test' });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe('PUT /chains/:id', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const res = await request(app).put('/chains/1').send({ name: 'test' });
      expect(res.status).toBe(401);
    });

    it('returns 403 for authenticated non-admin requests', async () => {
      const res = await request(app)
        .put('/chains/1')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'test' });
      expect(res.status).toBe(403);
    });

    it('allows admin requests', async () => {
      const res = await request(app)
        .put('/chains/1')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'test' });
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });

  describe('DELETE /chains/:id', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const res = await request(app).delete('/chains/1');
      expect(res.status).toBe(401);
    });

    it('returns 403 for authenticated non-admin requests', async () => {
      const res = await request(app)
        .delete('/chains/1')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('allows admin requests', async () => {
      const res = await request(app)
        .delete('/chains/1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });
});
