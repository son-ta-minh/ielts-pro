const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { MASTER_GALLERY_FILE } = require('../config');
const logger = require('../logger');

const GALLERY_FILE = MASTER_GALLERY_FILE();

const readItems = () => {
  try {
    const raw = fs.readFileSync(GALLERY_FILE, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    logger.warn('[Gallery] Failed to read file, resetting.', e.message);
    fs.writeFileSync(GALLERY_FILE, '[]');
    return [];
  }
};

const writeItems = (items) => {
  fs.writeFileSync(GALLERY_FILE, JSON.stringify(items, null, 2));
};

const normalizeGalleryImagePath = (rawPath = '') => {
  const value = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!value || !/^https?:\/\//i.test(value)) return value;

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname || '';
    const galleryPrefix = '/Gallery/';
    const galleryIndex = pathname.indexOf(galleryPrefix);
    if (galleryIndex >= 0) {
      return pathname.slice(galleryIndex);
    }
    return pathname || value;
  } catch {
    return value;
  }
};

router.get('/gallery', (req, res) => {
  return res.json(readItems());
});

router.post('/gallery', (req, res) => {
  const { title = 'Untitled', collection = 'Unsorted', imagePath = '', words = [], note = '' } = req.body || {};
  const normalizedImagePath = normalizeGalleryImagePath(imagePath);
  if (!normalizedImagePath) return res.status(400).json({ error: 'imagePath is required' });
  const items = readItems();
  const id = `wg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const payload = { id, title, collection, imagePath: normalizedImagePath, words, note };
  items.unshift(payload);
  writeItems(items);
  return res.json(payload);
});

router.put('/gallery/:id', (req, res) => {
  const { id } = req.params;
  const items = readItems();
  const idx = items.findIndex(i => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { title, collection, imagePath, words, note } = req.body || {};
  const updated = { ...items[idx] };
  if (title !== undefined) updated.title = title;
  if (collection !== undefined) updated.collection = collection;
  if (imagePath !== undefined) updated.imagePath = normalizeGalleryImagePath(imagePath);
  if (words !== undefined) updated.words = Array.isArray(words) ? words : [];
  if (note !== undefined) updated.note = note;
  items[idx] = updated;
  writeItems(items);
  return res.json(updated);
});

router.delete('/gallery/:id', (req, res) => {
  const { id } = req.params;
  const items = readItems();
  const next = items.filter(i => i.id !== id);
  if (next.length === items.length) return res.status(404).json({ error: 'Not found' });
  writeItems(next);
  return res.json({ success: true });
});

module.exports = router;
