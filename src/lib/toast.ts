// In-app notices (in place of the browser's alert()). Call toast.success("Saved.") or toast.error(...)
// from anywhere; <Toaster /> in App shows them in the corner. Successes fade after a few seconds,
// errors stay longer and can be closed.
export type ToastKind = 'success' | 'error' | 'info';
export interface Toast { id: number; kind: ToastKind; message: string }

let next = 1;
let items: Toast[] = [];
const listeners = new Set<(t: Toast[]) => void>();
const emit = () => listeners.forEach((l) => l(items));

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

function show(kind: ToastKind, message: string) {
  const id = next++;
  items = [...items.slice(-3), { id, kind, message }];   // at most 4 on screen
  emit();
  setTimeout(() => dismissToast(id), kind === 'error' ? 9000 : 4500);
  return id;
}

export const toast = {
  success: (message: string) => show('success', message),
  error: (message: string) => show('error', message),
  info: (message: string) => show('info', message),
};

export function subscribeToasts(fn: (t: Toast[]) => void) {
  listeners.add(fn);
  fn(items);
  return () => { listeners.delete(fn); };
}
