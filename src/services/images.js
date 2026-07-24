/**
 * images.js — Firebase Storage upload for book images (B2, PR-B).
 *
 * Images are content-addressed (id = SHA-256 of bytes; see utils/imageStore.js).
 * Locally they live in IndexedDB; here we upload them to Firebase Storage under
 * `books/{bookId}/images/{id}` and write a Firestore mirror doc
 * `books/{bookId}/images/{id}` with { w, h, mime, storagePath, downloadURL }.
 * The mirror lets us list a book's images (superadmin, cleanup) and lets the
 * resolver prefer the cloud URL over the local objectURL.
 *
 * Ownership: bytes belong to a book, and a book belongs to a user (books/{id}
 * carries `uid`). Storage/Firestore rules (storage.rules, firestore.rules)
 * enforce that only the owner (or an admin) can read/write these paths.
 *
 * SECURITY HOOK (PR-SEC, deferred): before uploading we must validate +
 * re-encode the image (client) and run cloud SafeSearch (server). Those calls
 * are marked below with `SECURITY-HOOK` and are currently pass-through.
 */

import { ref, uploadBytes, getDownloadURL, deleteObject, listAll } from 'firebase/storage';
import { doc, setDoc, getDocs, deleteDoc, collection, serverTimestamp } from 'firebase/firestore';
import { storage, db } from './firebase';

/** True when running against the mock (dev, no Firebase creds). */
export const isMockStorage = () => !storage || storage.__mock === true;

const imagePath = (bookId, id) => `books/${bookId}/images/${id}`;

/**
 * Upload one image blob to Storage and write its Firestore mirror doc.
 * Idempotent: content-addressed, so re-uploading the same id overwrites with
 * identical bytes. Returns the downloadURL (or null in mock mode).
 *
 * @param {string} bookId
 * @param {string} id     - content hash id (img_…)
 * @param {Blob}   blob
 * @param {{w?:number,h?:number,mime?:string}} meta
 * @returns {Promise<string|null>}
 */
export async function uploadImage(bookId, id, blob, meta = {}) {
  if (!bookId || !id || !blob) return null;
  if (isMockStorage()) return null; // dev: keep image local (IndexedDB) only

  // SECURITY-HOOK (PR-SEC): validate magic bytes + re-encode (client) and call
  // scanImageCloud(blob, bookId) here; abort the upload if it doesn't pass.

  const path = imagePath(bookId, id);
  const storageRef = ref(storage, path);
  const metadata = { contentType: meta.mime || blob.type || 'image/png' };
  await uploadBytes(storageRef, blob, metadata);
  const downloadURL = await getDownloadURL(storageRef);

  // Mirror doc for listing/cleanup and to let the resolver find the cloud URL.
  await setDoc(doc(db, 'books', bookId, 'images', id), {
    id,
    w: meta.w || 0,
    h: meta.h || 0,
    mime: metadata.contentType,
    storagePath: path,
    downloadURL,
    createdAt: serverTimestamp(),
  }, { merge: true });

  return downloadURL;
}

/**
 * Fetch the mirror docs for a book → map of id → { downloadURL, w, h, mime }.
 * Used by the resolver to prefer cloud URLs, and by the superadmin panel.
 */
export async function getBookImageIndex(bookId) {
  if (!bookId || isMockStorage()) return {};
  const snap = await getDocs(collection(db, 'books', bookId, 'images'));
  const out = {};
  snap.forEach((d) => { out[d.id] = d.data(); });
  return out;
}

/** Delete every image (Storage objects + mirror docs) for a book. */
export async function deleteBookImages(bookId) {
  if (!bookId || isMockStorage()) return;
  // Delete mirror docs.
  const snap = await getDocs(collection(db, 'books', bookId, 'images'));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  // Delete Storage objects.
  try {
    const dir = ref(storage, `books/${bookId}/images`);
    const listed = await listAll(dir);
    await Promise.all(listed.items.map((item) => deleteObject(item).catch(() => {})));
  } catch { /* nothing to delete */ }
}
