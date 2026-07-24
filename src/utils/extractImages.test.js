/**
 * extractImages.test.js — pull base64 <img> out of imported HTML.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { extractImagesFromHtml } from './extractImages.js';
import { getImageBlob, _resetMemStore } from './imageStore.js';

// 1×1 transparent PNG data-URI (valid, decodable by fetch/atob in jsdom).
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

beforeEach(() => { _resetMemStore(); });

describe('extractImagesFromHtml', () => {
  it('reemplaza el base64 por data-img-id y guarda los bytes', async () => {
    const html = `<p>texto</p><p><img src="${PNG}" alt="foto"></p>`;
    const out = await extractImagesFromHtml(html, 'book1');
    expect(out).not.toContain('base64');
    expect(out).toMatch(/data-img-id="img_[0-9a-f]{16}"/);
    expect(out).toContain('alt="foto"');
    const id = out.match(/data-img-id="([^"]+)"/)[1];
    expect(await getImageBlob(id)).toBeTruthy();
  });

  it('imágenes idénticas → mismo id (dedup en el almacén)', async () => {
    const html = `<img src="${PNG}"><img src="${PNG}">`;
    const out = await extractImagesFromHtml(html, 'book1');
    const ids = [...out.matchAll(/data-img-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBe(2);
    expect(ids[0]).toBe(ids[1]); // misma imagen → mismo content-hash
  });

  it('HTML sin imágenes no cambia', async () => {
    const html = '<p>sin imágenes</p>';
    expect(await extractImagesFromHtml(html, 'book1')).toBe(html);
  });

  it('src que NO es data-URI se deja intacto', async () => {
    const html = '<img src="https://example.com/foto.jpg">';
    const out = await extractImagesFromHtml(html, 'book1');
    expect(out).toBe(html);
    expect(out).not.toContain('data-img-id');
  });

  it('base64 corrupto no lanza y no pierde el resto del HTML', async () => {
    const html = `<p>antes</p><img src="data:image/png;base64,@@@no-valido"><p>después</p>`;
    const out = await extractImagesFromHtml(html, 'book1');
    // El cuerpo se conserva pase lo que pase con la imagen.
    expect(out).toContain('antes');
    expect(out).toContain('después');
  });
});
