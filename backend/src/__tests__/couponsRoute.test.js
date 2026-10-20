process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-jest';
process.env.NODE_ENV = 'test';

const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const db = jest.requireMock('../db/schema');
const router = require('../routes/coupons');

const app = express();
app.use(express.json());
app.use('/api/coupons', router);

const farmerToken = jwt.sign({ id: 1, role: 'farmer' }, process.env.JWT_SECRET);
const buyerToken = jwt.sign({ id: 2, role: 'buyer' }, process.env.JWT_SECRET);

beforeEach(() => {
  db.query.mockImplementation(async (sql) => {
    if (/SELECT active FROM users/i.test(sql)) return { rows: [{ active: 1 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
});

describe('coupon route database queries', () => {
  it('creates coupons with RETURNING id', async () => {
    db.query.mockImplementation(async (sql) => {
      if (/SELECT active FROM users/i.test(sql)) return { rows: [{ active: 1 }], rowCount: 1 };
      if (/INSERT INTO coupons/i.test(sql)) return { rows: [{ id: 8 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const response = await request(app)
      .post('/api/coupons')
      .set('Authorization', `Bearer ${farmerToken}`)
      .send({ code: 'save10', discount_type: 'percent', discount_value: 10 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, id: 8, code: 'SAVE10' });
    expect(db.query.mock.calls.at(-1)[0]).toContain('RETURNING id');
  });

  it("lists a farmer's coupons", async () => {
    db.query.mockImplementation(async (sql) => {
      if (/SELECT active FROM users/i.test(sql)) return { rows: [{ active: 1 }], rowCount: 1 };
      return { rows: [{ id: 8, code: 'SAVE10' }], rowCount: 1 };
    });

    const response = await request(app)
      .get('/api/coupons')
      .set('Authorization', `Bearer ${farmerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([{ id: 8, code: 'SAVE10' }]);
  });

  it("deletes the farmer's coupon with a portable returning clause", async () => {
    db.query.mockImplementation(async (sql) => {
      if (/SELECT active FROM users/i.test(sql)) return { rows: [{ active: 1 }], rowCount: 1 };
      return { rows: [{ id: 8 }], rowCount: 1 };
    });

    const response = await request(app)
      .delete('/api/coupons/8')
      .set('Authorization', `Bearer ${farmerToken}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(db.query.mock.calls.at(-1)).toEqual([
      'DELETE FROM coupons WHERE id = $1 AND farmer_id = $2 RETURNING id',
      ['8', 1],
    ]);
  });

  it('validates a coupon against its owning farmer and price', async () => {
    db.query.mockImplementation(async (sql) => {
      if (/SELECT active FROM users/i.test(sql)) return { rows: [{ active: 1 }], rowCount: 1 };
      if (/SELECT id, price, farmer_id FROM products/i.test(sql)) {
        return { rows: [{ id: 5, price: 20, farmer_id: 1 }], rowCount: 1 };
      }
      if (/SELECT min_quantity, price_per_unit FROM price_tiers/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/SELECT price FROM products/i.test(sql)) return { rows: [{ price: 20 }], rowCount: 1 };
      if (/SELECT \* FROM coupons/i.test(sql)) {
        return {
          rows: [{
            id: 8,
            farmer_id: 1,
            discount_type: 'percent',
            discount_value: 10,
            expires_at: null,
            max_uses: null,
            used_count: 0,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const response = await request(app)
      .post('/api/coupons/validate')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ code: 'save10', product_id: 5 });

    expect(response.status).toBe(200);
    expect(response.body.discount).toBe(2);
    expect(response.body.final_total).toBe(18);
  });
});
