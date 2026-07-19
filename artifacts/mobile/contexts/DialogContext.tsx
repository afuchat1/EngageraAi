import React, { createContext, useCallback, useContext, useState } from 'react';
import { Dialog, type DialogButton, type DialogConfig } from '@/components/Dialog';

interface DialogContextValue {
  /**
   * Drop-in replacement for `Alert.alert(title, message?, buttons?)`.
   * Renders the custom in-app Dialog instead of the native OS alert.
   */
  show: (title: string, message?: string, buttons?: DialogButton[]) => void;
}

const DialogContext = createContext<DialogContextValue>({
  show: () => {},
});

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<DialogConfig | null>(null);
  const [visible, setVisible] = useState(false);

  const show = useCallback((title: string, message?: string, buttons?: DialogButton[]) => {
    setConfig({ title, message, buttons });
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <DialogContext.Provider value={{ show }}>
      {children}
      {config ? (
        <Dialog
          visible={visible}
          onDismiss={dismiss}
          title={config.title}
          message={config.message}
          buttons={config.buttons}
        />
      ) : null}
    </DialogContext.Provider>
  );
}

/** Drop-in replacement for React Native's `Alert`. */
export function useDialog() {
  return useContext(DialogContext);
}
