/**
 * imageStore.test.js — content-addressed store: hashing, dedup, hydrate.
 *
 * jsdom has no IndexedDB, so the store falls back to its in-memory Map — which
 * is exactly what lets these tests exercise put/get without a fake-indexeddb dep.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashBytes, rewriteImgTag, hydrateImageSrcs,
  putImage, getImageBlob, _resetMemStore,
  listBookImages, retagBookImages, registerCloudUrl, registerCloudUrls,
  resolveImageSrc, cachedImageSrc,
} from './imageStore.js';

const blobOf = (str, type = 'image/png') => new Blob([str], { type });

beforeEach(() => { _resetMemStore(); });

describe('hashBytes', () => {
  it('es estable y con prefijo img_', async () => {
    const buf = new TextEncoder().encode('hola').buffer;
    const a = await hashBytes(buf);
    const b = await hashBytes(new TextEncoder().encode('hola').buffer);
    expect(a).toBe(b);
    expect(a).toMatch(/^img_[0-9a-f]{16}$/);
  });

  it('bytes distintos → id distinto', async () => {
    const a = await hashBytes(new TextEncoder().encode('uno').buffer);
    const b = await hashBytes(new TextEncoder().encode('dos').buffer);
    expect(a).not.toBe(b);
  });
});

describe('rewriteImgTag', () => {
  it('quita el src base64 y estampa data-img-id + data-w/h', () => {
    const tag = '<img src="data:image/png;base64,AAAA" alt="foto">';
    const out = rewriteImgTag(tag, 'img_abc', { w: 800, h: 600 });
    expect(out).not.toContain('base64');
    expect(out).not.toContain('src=');
    expect(out).toContain('data-img-id="img_abc"');
    expect(out).toContain('data-w="800"');
    expect(out).toContain('data-h="600"');
    expect(out).toContain('alt="foto"');
  });

  it('no duplica data-w si el tag ya lo trae', () => {
    const tag = '<img src="data:x" data-w="100" data-h="50">';
    const out = rewriteImgTag(tag, 'img_x', { w: 999, h: 999 });
    expect((out.match(/data-w=/g) || []).length).toBe(1);
    expect(out).toContain('data-w="100"');
  });
});

describe('hydrateImageSrcs', () => {
  it('inyecta src desde el resolver', () => {
    const html = '<p><img data-img-id="img_1" data-w="10" data-h="10"></p>';
    const out = hydrateImageSrcs(html, (id) => (id === 'img_1' ? 'blob:fake' : null));
    expect(out).toContain('src="blob:fake"');
  });

  it('deja intacto si el resolver no encuentra el id', () => {
    const html = '<img data-img-id="img_x">';
    const out = hydrateImageSrcs(html, () => null);
    expect(out).toBe(html);
  });

  it('no re-hidrata un img que ya tiene src', () => {
    const html = '<img data-img-id="img_1" src="blob:existing">';
    const out = hydrateImageSrcs(html, () => 'blob:new');
    expect(out).toContain('blob:existing');
    expect(out).not.toContain('blob:new');
  });
});

describe('putImage / getImageBlob (dedup)', () => {
  it('mismo contenido → mismo id, una sola entrada', async () => {
    const id1 = await putImage(blobOf('PIXELS'));
    const id2 = await putImage(blobOf('PIXELS'));
    expect(id1).toBe(id2);
    const blob = await getImageBlob(id1);
    expect(blob).toBeTruthy();
  });

  it('contenido distinto → id distinto', async () => {
    const a = await putImage(blobOf('AAA'));
    const b = await putImage(blobOf('BBB'));
    expect(a).not.toBe(b);
  });

  it('id desconocido → null', async () => {
    expect(await getImageBlob('img_nope')).toBeNull();
  });
});

describe('listBookImages / retagBookImages (PR-B)', () => {
  it('lista solo las imágenes del libro dado', async () => {
    await putImage(blobOf('A'), { bookId: 'b1' });
    await putImage(blobOf('B'), { bookId: 'b1' });
    await putImage(blobOf('C'), { bookId: 'b2' });
    const b1 = await listBookImages('b1');
    expect(b1.length).toBe(2);
    expect(b1.every((r) => r.bookId === 'b1')).toBe(true);
  });

  it('re-etiqueta las imágenes de un bookId a otro (promoción local→nube)', async () => {
    await putImage(blobOf('X'), { bookId: 'local-1' });
    const n = await retagBookImages('local-1', 'cloud-9');
    expect(n).toBe(1);
    expect((await listBookImages('local-1')).length).toBe(0);
    expect((await listBookImages('cloud-9')).length).toBe(1);
  });
});

describe('resolver: cloud URL preferida sobre local (PR-B)', () => {
  it('resolveImageSrc devuelve la downloadURL registrada', async () => {
    const id = await putImage(blobOf('PIXELS'), { bookId: 'b1' });
    registerCloudUrl(id, 'https://cdn.example/img.png');
    expect(await resolveImageSrc(id)).toBe('https://cdn.example/img.png');
    expect(cachedImageSrc(id)).toBe('https://cdn.example/img.png');
  });

  it('registerCloudUrls acepta un índice { id: {downloadURL} }', async () => {
    const id = await putImage(blobOf('ZZ'), { bookId: 'b1' });
    registerCloudUrls({ [id]: { downloadURL: 'https://cdn.example/z.png' } });
    expect(cachedImageSrc(id)).toBe('https://cdn.example/z.png');
  });
});
