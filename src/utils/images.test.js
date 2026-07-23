import { describe, it, expect, vi } from 'vitest';
import { readImageDims, scaleImage, precomputeImageDims } from './images.js';

describe('readImageDims', () => {
  it('lee data-w/data-h', () => {
    expect(readImageDims('<img src="x" data-w="1200" data-h="800">')).toEqual({ w: 1200, h: 800 });
  });
  it('cae a width/height attrs', () => {
    expect(readImageDims('<img src="x" width="600" height="400">')).toEqual({ w: 600, h: 400 });
  });
  it('cae a width/height del style', () => {
    expect(readImageDims('<img src="x" style="width:300px;height:150px">')).toEqual({ w: 300, h: 150 });
  });
  it('con solo un lado, deriva el otro por proporción 4:3', () => {
    expect(readImageDims('<img src="x" data-w="400">')).toEqual({ w: 400, h: 300 });
  });
  it('sin dimensiones → null', () => {
    expect(readImageDims('<img src="x">')).toBeNull();
  });
});

describe('scaleImage', () => {
  const CW = 400; // column width

  it('escala al ancho de columna conservando proporción', () => {
    // 1200×800 (ratio 0.667), maxWidthFrac 0.9 → maxW 360 → h = 360×0.667 = 240
    const box = scaleImage({ w: 1200, h: 800 }, CW, { maxWidthFrac: 0.9 });
    expect(box.width).toBe(360);
    expect(box.height).toBe(240);
  });

  it('nunca agranda una imagen más pequeña que la columna', () => {
    const box = scaleImage({ w: 200, h: 100 }, CW, { maxWidthFrac: 0.9 });
    expect(box.width).toBe(200); // se queda a su tamaño intrínseco
    expect(box.height).toBe(100);
  });

  it('respeta el tope de altura (imagen muy alta)', () => {
    // 400×1200 (retrato), pageHeight 600, maxHeightFrac 0.85 → maxH 510
    const box = scaleImage({ w: 400, h: 1200 }, CW, { maxWidthFrac: 0.9, maxHeightFrac: 0.85 }, 600);
    expect(box.height).toBeLessThanOrEqual(510);
    // width recomputado desde la altura, proporción conservada
    expect(box.width / box.height).toBeCloseTo(400 / 1200, 1);
  });

  it('dims desconocidas → caja por defecto al ancho máximo', () => {
    const box = scaleImage(null, CW, { maxWidthFrac: 0.9 });
    expect(box.width).toBe(360);
    expect(box.height).toBeGreaterThan(0);
  });

  it('es determinista', () => {
    const a = scaleImage({ w: 1000, h: 700 }, CW);
    const b = scaleImage({ w: 1000, h: 700 }, CW);
    expect(a).toEqual(b);
  });

  it('más grande el intrínseco → misma altura relativa (monótono)', () => {
    const small = scaleImage({ w: 100, h: 100 }, CW);
    const big = scaleImage({ w: 2000, h: 2000 }, CW);
    expect(big.height).toBeGreaterThanOrEqual(small.height);
  });
});

describe('precomputeImageDims', () => {
  it('sin window / sin <img> devuelve el html tal cual', async () => {
    // jsdom no está activo en este archivo → typeof window === 'undefined'.
    const html = '<p>hola</p>';
    expect(await precomputeImageDims(html)).toBe(html);
  });

  it('html sin imágenes no cambia', async () => {
    const html = '<p>solo texto</p>';
    expect(await precomputeImageDims(html)).toBe(html);
  });

  it('imagen que ya tiene data-w no se re-procesa', async () => {
    const html = '<img src="x" data-w="100" data-h="50">';
    // Sin window igual devuelve tal cual; el guard de data-w es defensa extra.
    expect(await precomputeImageDims(html)).toContain('data-w="100"');
  });
});
