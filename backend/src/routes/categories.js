/**
 * @swagger
 * tags:
 *   name: Categories
 *   description: Product category management
 *
 * /api/v1/categories:
 *   get:
 *     summary: List all categories with product counts
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: Array of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string }
 *                       slug: { type: string }
 *                       product_count: { type: integer }
 *
 * /api/v1/admin/categories:
 *   post:
 *     summary: Create a category (admin only)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               slug: { type: string }
 *     responses:
 *       201:
 *         description: Category created
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         description: Slug already taken
 */
const router = require('express').Router();
const db = require('../db/schema');
const auth = require('../middleware/auth');
const { err } = require('../middleware/error');
const { sanitizeText } = require('../utils/sanitize');

function toSlug(name) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// GET /api/categories - public, includes product_count
router.get('/', async (_req, res) => {
  const { rows } = await db.query(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `);
  res.json({
    success: true,
    data: rows.map((row) => ({ ...row, product_count: Number(row.product_count) })),
  });
});

// POST /api/admin/categories - admin only
router.post('/admin/categories', auth, async (req, res) => {
  if (req.user.role !== 'admin') return err(res, 403, 'Admins only', 'forbidden');

  const name = sanitizeText(req.body.name || '');
  if (!name) return err(res, 400, 'name is required', 'validation_error');

  const slug = sanitizeText(req.body.slug || '') || toSlug(name);
  if (!/^[a-z0-9-]+$/.test(slug))
    return err(res, 400, 'slug must be lowercase alphanumeric with hyphens', 'validation_error');

  const { rows: existingRows } = await db.query('SELECT id FROM categories WHERE slug = $1', [slug]);
  const existing = existingRows[0];
  if (existing) return err(res, 409, 'A category with that slug already exists', 'slug_taken');

  const { rows } = await db.query(
    'INSERT INTO categories (name, slug) VALUES ($1, $2) RETURNING id',
    [name, slug]
  );
  res.status(201).json({ success: true, id: rows[0].id, name, slug });
});

// PATCH /api/admin/categories/:id - admin only
router.patch('/admin/categories/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return err(res, 403, 'Admins only', 'forbidden');

  const { rows: categoryRows } = await db.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
  const category = categoryRows[0];
  if (!category) return err(res, 404, 'Category not found', 'not_found');

  const name = req.body.name ? sanitizeText(req.body.name) : category.name;
  const slug = req.body.slug ? sanitizeText(req.body.slug) : (req.body.name ? toSlug(name) : category.slug);

  if (slug !== category.slug) {
    if (!/^[a-z0-9-]+$/.test(slug))
      return err(res, 400, 'slug must be lowercase alphanumeric with hyphens', 'validation_error');
    const { rows: conflicts } = await db.query(
      'SELECT id FROM categories WHERE slug = $1 AND id != $2',
      [slug, req.params.id]
    );
    const conflict = conflicts[0];
    if (conflict) return err(res, 409, 'A category with that slug already exists', 'slug_taken');
  }

  await db.query('UPDATE categories SET name = $1, slug = $2 WHERE id = $3', [name, slug, req.params.id]);
  res.json({ success: true, id: Number(req.params.id), name, slug });
});

// DELETE /api/admin/categories/:id - admin only
router.delete('/admin/categories/:id', auth, async (req, res) => {
  if (req.user.role !== 'admin') return err(res, 403, 'Admins only', 'forbidden');

  const { rows: categoryRows } = await db.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
  const category = categoryRows[0];
  if (!category) return err(res, 404, 'Category not found', 'not_found');

  const { rows: countRows } = await db.query('SELECT COUNT(*) as count FROM products WHERE category_id = $1', [
    req.params.id,
  ]);
  const productCount = Number(countRows[0].count);
  if (productCount > 0)
    return err(res, 409, 'Cannot delete category with assigned products', 'category_has_products');

  await db.query('DELETE FROM categories WHERE id = $1', [req.params.id]);
  res.json({ success: true, message: 'Category deleted' });
});

module.exports = router;
