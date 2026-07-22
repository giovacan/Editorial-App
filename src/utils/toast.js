import { useToastStore } from '../store/useToastStore';

/**
 * toast — non-blocking notifications, usable ANYWHERE (React components and
 * plain utility modules alike). Replaces the old blocking `alert()` calls.
 *
 *   toast.error('No se pudo exportar');
 *   toast.success('PDF descargado');
 *   toast.info('Paginando…', 0);   // 0 = sticky, close manually or dismiss()
 *
 * Under the hood it pushes to the framework-agnostic zustand store, so it works
 * outside React (e.g. exporters.js, pdfVectorRenderer.js) — no hooks needed.
 */
const raise = (type) => (message, duration) =>
  useToastStore.getState().add(type, String(message), duration);

export const toast = {
  success: raise('success'),
  error: raise('error'),
  info: raise('info'),
  warning: raise('warning'),
  /** Remove a specific toast by id (the id returned by the calls above). */
  dismiss: (id) => useToastStore.getState().remove(id),
  /** Remove all toasts. */
  clear: () => useToastStore.getState().clear(),
};

export default toast;
