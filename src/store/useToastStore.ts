import { create } from 'zustand';
import { nanoid } from 'nanoid';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  /** ms until auto-dismiss; 0 = sticky (must be closed manually). */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  add: (type: ToastType, message: string, duration?: number) => string;
  remove: (id: string) => void;
  clear: () => void;
}

// Default durations per type. Errors linger longer (the user needs to read
// them); success/info are brief. 0 = sticky.
const DEFAULT_DURATION: Record<ToastType, number> = {
  success: 3500,
  info: 4000,
  warning: 5000,
  error: 6000,
};

const MAX_TOASTS = 4; // keep the stack readable — drop the oldest beyond this

/**
 * Framework-agnostic toast store (zustand). Usable from React components AND
 * from plain utility modules via `useToastStore.getState()` — which is why the
 * export helpers (`utils/toast.js`) can raise toasts without hooks.
 */
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  add: (type, message, duration) => {
    const id = nanoid(8);
    const d = duration ?? DEFAULT_DURATION[type];
    set((s) => {
      const next = [...s.toasts, { id, type, message, duration: d }];
      // Cap the stack: drop oldest so a burst of errors can't fill the screen.
      return { toasts: next.slice(-MAX_TOASTS) };
    });
    return id;
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

export { DEFAULT_DURATION };
