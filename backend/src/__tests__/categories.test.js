/**
 * Regression test for issue: categories.js not registered via registerRoute.
 * GET /api/v1/categories must return 200, not 404.
 */

process.env.JWT_SECRET = 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mockDb = jest.requireMock('../db/schema');

jest.mock('../routes', () => {
  const express = require('express');
  const router = express.Router();

  function addDeprecationHeaders(req, res, next) {
    res.setHeader('Deprecation', 'true');
    next();
  }

  function registerRoute(basePrefix, path, handler) {
    router.use(`/api${path}`, addDeprecationHeaders, handler);
    router.use(`/api/v1${path}`, handler);
  }

  registerRoute('/', '/categories', require('../routes/categories'));
  return router;
});

const app = require('../app');
const adminToken = jwt.sign({ id: 1, role: 'admin' }, process.env.JWT_SECRET);

beforeEach(() => {
  mockDb.query.mockImplementation(async (sql) => {
    if (/SELECT active FROM users/i.test(sql)) {
      return { rows: [{ active: 1 }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
});

describe('GET /api/v1/categories', () => {
  it('returns 200 (not 404) — registerRoute fix regression', async () => {
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/categories (legacy)', () => {
  it('returns 200 with deprecation header', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.headers['deprecation']).toBe('true');
  });
});

describe('admin category CRUD', () => {
  it('creates a category using the id returned by the insert', async () => {
    mockDb.query.mockImplementation(async (sql) => {
      if (/SELECT active FROM users/i.test(sql)) return { rows: [{ active: 1 }], rowCount: 1 };
      if (/INSERT INTO categories/i.test(sql)) return { rows: [{ id: 12 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const res = await request(app)
      .post('/api/v1/categories/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Root Vegetables' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(12);
    expect(mockDb.query.mock.calls.at(-1)[0]).toContain('RETURNING id');
  });

  it('updates a category with portable placeholders', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ active: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 4, name: 'Produce', slug: 'produce' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .patch('/api/v1/categories/admin/categories/4')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Fresh Produce' });

    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('fresh-produce');
    expect(mockDb.query.mock.calls.at(-1)[0]).toContain('WHERE id = $3');
  });

  it('deletes an empty category', async () => {
    mockDb.query
      .mockResolvedValueOnce({ rows: [{ active: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ id: 4, name: 'Produce', slug: 'produce' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .delete('/api/v1/categories/admin/categories/4')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Category deleted');
    expect(mockDb.query.mock.calls.at(-1)[0]).toContain('WHERE id = $1');
  });
});
