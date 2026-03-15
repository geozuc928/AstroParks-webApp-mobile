'use strict';
const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET /api/calibration/:cameraId
router.get('/:cameraId', async (req, res) => {
  const { cameraId } = req.params;

  const { rows: configs } = await pool.query(
    'SELECT * FROM calibration_configs WHERE camera_id = $1',
    [cameraId]
  );
  const config = configs[0];

  if (!config) {
    return res.status(404).json({ error: 'No calibration found for this camera' });
  }

  const { rows: polygons } = await pool.query(
    'SELECT * FROM parking_space_polygons WHERE config_id = $1 ORDER BY space_id',
    [config.id]
  );

  const spaces = polygons.map(p => ({
    space_id: p.space_id,
    space_label: p.space_label,
    section: p.section,
    polygon: JSON.parse(p.polygon_points),
  }));

  return res.json({
    camera_id: config.camera_id,
    label: config.label,
    img_width: config.img_width,
    img_height: config.img_height,
    spaces,
    updated_at: config.updated_at,
  });
});

// GET /api/calibration
router.get('/', async (_req, res) => {
  const { rows: configs } = await pool.query(`
    SELECT c.*, COUNT(p.id)::int AS space_count
    FROM calibration_configs c
    LEFT JOIN parking_space_polygons p ON p.config_id = c.id
    GROUP BY c.id
    ORDER BY c.updated_at DESC
  `);
  return res.json(configs);
});

// POST /api/calibration
router.post('/', async (req, res) => {
  const { camera_id, label, img_width, img_height, spaces } = req.body;

  if (!camera_id || !Array.isArray(spaces)) {
    return res.status(400).json({ error: 'camera_id and spaces array are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      INSERT INTO calibration_configs (camera_id, label, img_width, img_height, updated_at)
      VALUES ($1, $2, $3, $4, EXTRACT(EPOCH FROM NOW())::BIGINT)
      ON CONFLICT(camera_id) DO UPDATE SET
        label = EXCLUDED.label,
        img_width = EXCLUDED.img_width,
        img_height = EXCLUDED.img_height,
        updated_at = EXCLUDED.updated_at
    `, [camera_id, label || 'Parking Lot', img_width || null, img_height || null]);

    const { rows: configRows } = await client.query(
      'SELECT id FROM calibration_configs WHERE camera_id = $1',
      [camera_id]
    );
    const configId = configRows[0].id;

    await client.query('DELETE FROM parking_space_polygons WHERE config_id = $1', [configId]);

    for (const space of spaces) {
      if (!space.space_id || !space.section || !Array.isArray(space.polygon)) continue;
      await client.query(`
        INSERT INTO parking_space_polygons
          (config_id, space_id, space_label, section, polygon_points)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        configId,
        space.space_id,
        space.space_label || `Space ${space.space_id}`,
        space.section,
        JSON.stringify(space.polygon),
      ]);
    }

    await client.query('COMMIT');
    return res.json({ success: true, config_id: configId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Calibration] Save error:', err);
    return res.status(500).json({ error: 'Failed to save calibration' });
  } finally {
    client.release();
  }
});

// DELETE /api/calibration/:cameraId
router.delete('/:cameraId', async (req, res) => {
  const { cameraId } = req.params;
  const { rowCount } = await pool.query(
    'DELETE FROM calibration_configs WHERE camera_id = $1',
    [cameraId]
  );
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Calibration not found' });
  }
  return res.json({ success: true });
});

module.exports = router;
