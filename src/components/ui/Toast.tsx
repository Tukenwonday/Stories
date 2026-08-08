import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { cn } from "../../lib/design-tokens";
import { Check, X, AlertCircle, Info } from "lucide-react";

export interface Toast {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => string;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    const newToast = { ...toast, id };
    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => onRemove(toast.id), toast.duration ?? 4000);
      return () => clearTimeout(timer);
    }
  }, [toast, onRemove]);

  const icons = {
    success: <Check className="h-5 w-5 text-success" />,
    error: <X className="h-5 w-5 text-danger" />,
    warning: <AlertCircle className="h-5 w-5 text-warning" />,
    info: <Info className="h-5 w-5 text-gold" />,
  };

  const backgrounds = {
    success: "bg-green-500/10 border-green-500/30",
    error: "bg-red-500/10 border-red-500/30",
    warning: "bg-yellow-500/10 border-yellow-500/30",
    info: "bg-gold/10 border-gold/30",
  };

  return (
    <div
      className={cn(
        "pointer-events-auto animate-slide-in-right flex items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur",
        "min-w-[280px] max-w-[360px]",
        backgrounds[toast.type]
      )}
      role="alert"
    >
      <div className="shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">{toast.title}</p>
        {toast.message && <p className="mt-0.5 text-sm text-muted">{toast.message}</p>}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onRemove(toast.id);
            }}
            className="mt-2 text-sm font-semibold text-gold hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-muted hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function toastSuccess(title: string, message?: string, options?: Partial<Toast>) {
  return { type: "success" as const, title, message, ...options };
}

export function toastError(title: string, message?: string, options?: Partial<Toast>) {
  return { type: "error" as const, title, message, ...options };
}

export function toastWarning(title: string, message?: string, options?: Partial<Toast>) {
  return { type: "warning" as const, title, message, ...options };
}

export function toastInfo(title: string, message?: string, options?: Partial<Toast>) {
  return { type: "info" as const, title, message, ...options };
}