---
name: Engagera dialog system
description: Custom confirm/alert system architecture — file split, providers, hooks
---

## Structure

- `src/components/ui/confirm-dialog.tsx` — `ConfirmProvider` component + `ConfirmContext` export
- `src/components/ui/alert-toast.tsx` — `AlertProvider` component + `AlertContext` export
- `src/hooks/useConfirm.ts` — `useConfirm()` hook (reads ConfirmContext)
- `src/hooks/useAlert.ts` — `useAlert()` hook (reads AlertContext)

**Why split:** Vite Fast Refresh requires a file export only React components OR only hooks/utilities. Mixing both in one file causes "Could not Fast Refresh" warnings and falls back to full reload on save. Keeping providers in `.tsx` and hooks in `.ts` files resolves this.

## Usage

```ts
// In any component within providers
import { useConfirm } from "@/hooks/useConfirm";
import { useAlert } from "@/hooks/useAlert";

const confirm = useConfirm();
const alert = useAlert();

// Modal confirm (returns Promise<boolean>)
const ok = await confirm({ title: "Delete?", description: "...", confirmLabel: "Delete", cancelLabel: "Cancel" });

// Toast notification
alert("Key revoked.", "success"); // types: "info" | "success" | "error"
```

## Wiring

Both providers are in `App.tsx`, wrapping the WouterRouter:
```tsx
<ConfirmProvider>
  <AlertProvider>
    <WouterRouter ...>
      <Router />
    </WouterRouter>
  </AlertProvider>
</ConfirmProvider>
```

**Why:** Providers must wrap the entire app so any page/component can call the hooks.
