process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = jest.requireMock('../db/schema');
const reviewsRouter = require('../routes/reviews');

const app = express();
app.use(express.json());
app.use('/api/reviews', reviewsRouter);
app.use('/api/admin/reviews', reviewsRouter.adminRouter);
app.use('/api/products', reviewsRouter.productRouter);

const buyerToken = jwt.sign({ id: 2, role: 'buyer' }, process.env.JWT_SECRET);
const adminToken = jwt.sign({ id: 99, role: 'admin' }, process.env.JWT_SECRET);

beforeEach(() => {
  db.query.mockImplementation(async (sql) => {
    if (/SELECT active FROM users/i.test(sql)) return { rows: [{ active: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
});

describe('review route database queries', () => {
  it('lists approved product reviews', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 4, rating: 5, body: 'Fresh produce', buyer_name: 'Buyer' }],
      rowCount: 1,
    });

    const response = await request(app).get('/api/reviews/5');

    expect(response.status).toBe(200);
    expect(response.body.data[0].body).toBe('Fresh produce');
    expect(db.query.mock.calls[0][0]).toContain("r.status = 'approved'");
  });

  it('deletes a buyer-owned review and recalculates its product rating', async () => {
    db.query.mockImplementation(async (sql) => {
      if (/SELECT active FROM users/i.test(sql)) return { rows: [{ active: 1 }], rowCount: 1 };
      if (/SELECT \* FROM reviews WHERE id = \$1 AND buyer_id = \$2/i.test(sql)) {
        return { rows: [{ id: 4, product_id: 5 }], rowCount: 1 };
      }
      if (/SELECT ROUND\(AVG\(rating\)/i.test(sql)) {
        return { rows: [{ avg: 4, cnt: 1 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const response = await request(app)
      .delete('/api/reviews/4')
      .set('Authorization', `Bearer ${buyerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Review deleted');
    expect(db.query.mock.calls.some(([sql]) => /DELETE FROM reviews WHERE id = \$1/i.test(sql))).toBe(true);
    expect(db.query.mock.calls.some(([sql]) => /UPDATE products SET avg_rating = \$1/i.test(sql))).toBe(true);
  });

  it('approves a review and recalculates the product rating', async () => {
    db.query.mockImplementation(async (sql) => {
      if (/SELECT active FROM users/i.test(sql)) return { rows: [{ active: 1 }], rowCount: 1 };
      if (/SELECT \* FROM reviews WHERE id = \$1/i.test(sql)) {
        return { rows: [{ id: 4, product_id: 5 }], rowCount: 1 };
      }
      if (/SELECT ROUND\(AVG\(rating\)/i.test(sql)) {
        return { rows: [{ avg: 5, cnt: 2 }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    const response = await request(app)
      .patch('/api/admin/reviews/4/approve')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Review approved');
    expect(db.query.mock.calls.some(([sql]) => /UPDATE reviews SET status = 'approved'/i.test(sql))).toBe(true);
  });
});
