import { useContext } from "react";
import { ConfirmContext } from "@/components/ui/confirm-dialog";

export function useConfirm() {
  return useContext(ConfirmContext);
}
