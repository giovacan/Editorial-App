/**
 * imageSync.test.js — local→cloud image sync (PR-B), with services/images mocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the cloud layer so we don't touch Firebase.
const uploaded = [];
vi.mock('../services/images.js', () => ({
  isMockStorage: () => false,
  getBookImageIndex: vi.fn(async () => ({})),
  uploadImage: vi.fn(async (bookId, id) => {
    uploaded.push({ bookId, id });
    return `https://cdn.example/${bookId}/${id}`;
  }),
}));

import { syncBookImages } from './imageSync.js';
import { putImage, _resetMemStore, cachedImageSrc, listBookImages } from './imageStore.js';
import { getBookImageIndex, uploadImage } from '../services/images.js';

const blobOf = (s) => new Blob([s], { type: 'image/png' });

beforeEach(() => {
  _resetMemStore();
  uploaded.length = 0;
  vi.clearAllMocks();
  getBookImageIndex.mockResolvedValue({});
});

describe('syncBookImages', () => {
  it('sube las imágenes locales no sincronizadas y registra la URL nube', async () => {
    const id = await putImage(blobOf('IMG'), { bookId: 'b1' });
    const res = await syncBookImages('b1');
    expect(res.uploaded).toBe(1);
    expect(uploaded).toEqual([{ bookId: 'b1', id }]);
    // tras subir, el resolver prefiere la downloadURL
    expect(cachedImageSrc(id)).toBe(`https://cdn.example/b1/${id}`);
  });

  it('no re-sube lo que ya está en el índice de la nube', async () => {
    const id = await putImage(blobOf('IMG'), { bookId: 'b1' });
    getBookImageIndex.mockResolvedValue({ [id]: { downloadURL: 'https://cdn.example/existing' } });
    const res = await syncBookImages('b1');
    expect(res.uploaded).toBe(0);
    expect(uploadImage).not.toHaveBeenCalled();
    // la URL existente queda registrada igualmente
    expect(cachedImageSrc(id)).toBe('https://cdn.example/existing');
  });

  it('solo sube las imágenes del libro pedido', async () => {
    await putImage(blobOf('A'), { bookId: 'b1' });
    await putImage(blobOf('B'), { bookId: 'b2' });
    await syncBookImages('b1');
    expect(uploaded.length).toBe(1);
    expect(uploaded[0].bookId).toBe('b1');
    expect((await listBookImages('b2'))[0].synced).toBeFalsy();
  });

  it('sin bookId → no hace nada', async () => {
    const res = await syncBookImages(null);
    expect(res.uploaded).toBe(0);
    expect(uploadImage).not.toHaveBeenCalled();
  });
});
