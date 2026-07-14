import React, { createContext, useContext, useCallback, useState } from "react";

export type AlertType = "info" | "error" | "success";

interface AlertItem {
  id: number;
  message: string;
  type: AlertType;
}

export const AlertContext = createContext<(msg: string, type?: AlertType) => void>(() => {});

let _counter = 0;

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const push = useCallback((message: string, type: AlertType = "info") => {
    const id = ++_counter;
    setAlerts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== id)), 4000);
  }, []);

  return (
    <AlertContext.Provider value={push}>
      {children}
      {alerts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
          {alerts.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 px-4 py-3 bg-white text-black rounded-xl shadow-2xl text-sm font-medium animate-in slide-in-from-right-4 duration-200 max-w-xs pointer-events-auto"
            >
              <span className="flex-1">{a.message}</span>
              <button
                onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))}
                className="text-black/40 hover:text-black transition-colors shrink-0 ml-1 text-xs"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </AlertContext.Provider>
  );
}
