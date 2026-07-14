import { useAdminOverview } from "@/lib/adminApi";
import { ApiError } from "@workspace/api-client-react";

/**
 * Admin status is derived from whether the /admin/overview call succeeds.
 * A 401/403 means the signed-in user is not an Engagera admin.
 */
export function useIsAdmin() {
  const { data, error, isLoading } = useAdminOverview();
  const isForbidden = error instanceof ApiError && (error.status === 401 || error.status === 403);
  return {
    isAdmin: !!data && !isForbidden,
    isLoading,
    isForbidden,
  };
}
