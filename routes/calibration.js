'use strict';
const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/calibration/:cameraId
// Returns the full calibration config (spaces + polygons) for a camera
router.get('/:cameraId', (req, res) => {
  const { cameraId } = req.params;

  const config = db
    .prepare('SELECT * FROM calibration_configs WHERE camera_id = ?')
    .get(cameraId);

  if (!config) {
    return res.status(404).json({ error: 'No calibration found for this camera' });
  }

  const polygons = db
    .prepare('SELECT * FROM parking_space_polygons WHERE config_id = ? ORDER BY space_id')
    .all(config.id);

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
// Returns a list of all calibrated cameras
router.get('/', (_req, res) => {
  const configs = db
    .prepare(`
      SELECT c.*, COUNT(p.id) AS space_count
      FROM calibration_configs c
      LEFT JOIN parking_space_polygons p ON p.config_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC
    `)
    .all();

  return res.json(configs);
});

// POST /api/calibration
// Creates or replaces the full calibration for a camera
router.post('/', (req, res) => {
  const { camera_id, label, img_width, img_height, spaces } = req.body;

  if (!camera_id || !Array.isArray(spaces)) {
    return res.status(400).json({ error: 'camera_id and spaces array are required' });
  }

  const saveCalibration = db.transaction(() => {
    // Upsert the config row
    db.prepare(`
      INSERT INTO calibration_configs (camera_id, label, img_width, img_height, updated_at)
      VALUES (?, ?, ?, ?, unixepoch())
      ON CONFLICT(camera_id) DO UPDATE SET
        label = excluded.label,
        img_width = excluded.img_width,
        img_height = excluded.img_height,
        updated_at = excluded.updated_at
    `).run(camera_id, label || 'Parking Lot', img_width || null, img_height || null);

    const config = db
      .prepare('SELECT id FROM calibration_configs WHERE camera_id = ?')
      .get(camera_id);

    // Remove old polygons for this config
    db.prepare('DELETE FROM parking_space_polygons WHERE config_id = ?').run(config.id);

    // Insert new polygons
    const insertPolygon = db.prepare(`
      INSERT INTO parking_space_polygons
        (config_id, space_id, space_label, section, polygon_points)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const space of spaces) {
      if (!space.space_id || !space.section || !Array.isArray(space.polygon)) continue;
      insertPolygon.run(
        config.id,
        space.space_id,
        space.space_label || `Space ${space.space_id}`,
        space.section,
        JSON.stringify(space.polygon)
      );
    }

    return config.id;
  });

  try {
    const configId = saveCalibration();
    return res.json({ success: true, config_id: configId });
  } catch (err) {
    console.error('[Calibration] Save error:', err);
    return res.status(500).json({ error: 'Failed to save calibration' });
  }
});

// DELETE /api/calibration/:cameraId
// Removes a calibration config and all its polygons
router.delete('/:cameraId', (req, res) => {
  const { cameraId } = req.params;
  const result = db
    .prepare('DELETE FROM calibration_configs WHERE camera_id = ?')
    .run(cameraId);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Calibration not found' });
  }
  return res.json({ success: true });
});

module.exports = router;
