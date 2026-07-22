import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore, DEFAULT_DURATION } from './useToastStore';

const reset = () => useToastStore.setState({ toasts: [] });

describe('useToastStore', () => {
  beforeEach(reset);

  it('add() agrega un toast y devuelve su id', () => {
    const id = useToastStore.getState().add('success', 'ok');
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ id, type: 'success', message: 'ok' });
  });

  it('usa la duración por defecto según el tipo', () => {
    useToastStore.getState().add('error', 'boom');
    expect(useToastStore.getState().toasts[0].duration).toBe(DEFAULT_DURATION.error);
  });

  it('respeta una duración explícita (0 = sticky)', () => {
    useToastStore.getState().add('info', 'wait', 0);
    expect(useToastStore.getState().toasts[0].duration).toBe(0);
  });

  it('remove() quita solo el toast indicado', () => {
    const a = useToastStore.getState().add('info', 'a');
    const b = useToastStore.getState().add('info', 'b');
    useToastStore.getState().remove(a);
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].id).toBe(b);
  });

  it('cap: nunca más de 4 toasts (descarta el más viejo)', () => {
    const add = useToastStore.getState().add;
    for (let i = 0; i < 7; i++) add('info', `m${i}`);
    const { toasts } = useToastStore.getState();
    expect(toasts).toHaveLength(4);
    // Debe conservar los 4 más recientes (m3..m6).
    expect(toasts.map((t) => t.message)).toEqual(['m3', 'm4', 'm5', 'm6']);
  });

  it('clear() vacía la pila', () => {
    useToastStore.getState().add('info', 'x');
    useToastStore.getState().clear();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
