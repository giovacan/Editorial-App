/**
 * imageSync.js — local (IndexedDB) → cloud (Firebase Storage) image sync (PR-B).
 *
 * When a book is open with a signed-in owner, its images are uploaded to Storage
 * in the BACKGROUND (never blocking the UI). Each upload registers the resulting
 * downloadURL so the resolver prefers the cloud URL, and marks the local record
 * synced so we don't re-upload. Content-addressed ids make this idempotent.
 *
 * This is also the migration path for an anonymous user who imported locally and
 * then logs in: on login we get a bookId + session, and this runs.
 */

import { listBookImages, markSynced, registerCloudUrl } from './imageStore.js';
import { uploadImage, getBookImageIndex, isMockStorage } from '../services/images.js';
import { registerCloudUrls } from './imageStore.js';

let running = new Set(); // bookIds currently syncing (avoid overlap)

/**
 * Upload any not-yet-synced images for a book to Storage. Safe to call often;
 * de-duped per book, no-op in mock mode or without a bookId.
 * @param {string} bookId
 * @returns {Promise<{uploaded:number, skipped:number}>}
 */
export async function syncBookImages(bookId) {
  if (!bookId || isMockStorage() || running.has(bookId)) return { uploaded: 0, skipped: 0 };
  running.add(bookId);
  try {
    // Pull existing cloud mirror first, so already-uploaded ids are known and
    // their URLs registered (cross-device: images uploaded elsewhere resolve).
    const cloudIndex = await getBookImageIndex(bookId);
    registerCloudUrls(cloudIndex);

    const locals = await listBookImages(bookId);
    let uploaded = 0, skipped = 0;
    for (const rec of locals) {
      if (cloudIndex[rec.id] || rec.synced) { skipped++; continue; }
      try {
        const url = await uploadImage(bookId, rec.id, rec.blob, {
          w: rec.w, h: rec.h, mime: rec.mime,
        });
        if (url) { registerCloudUrl(rec.id, url); await markSynced(rec.id); uploaded++; }
      } catch (e) {
        console.warn('syncBookImages: fallo subiendo', rec.id, e);
      }
    }
    return { uploaded, skipped };
  } finally {
    running.delete(bookId);
  }
}
