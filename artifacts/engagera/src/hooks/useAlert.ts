import { useContext } from "react";
import { AlertContext } from "@/components/ui/alert-toast";

export function useAlert() {
  return useContext(AlertContext);
}
