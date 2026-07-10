import { Router } from "express";
import type { RequestHandler } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

// All admin routes are read-only surfaces gated server-side by requireAdmin
// (engagera_admins membership) inside the `admin` Edge Function. The caller's
// Supabase JWT is forwarded as-is via proxyToEdge.
const adminProxy = (subpath: string): RequestHandler => async (req, res) => {
  await proxyToEdge(req, res, edgeFnUrl(`admin/${subpath}`));
};

router.get("/admin/overview", adminProxy("overview"));
router.get("/admin/dataset-candidates", adminProxy("dataset-candidates"));
router.get("/admin/dataset-candidate", adminProxy("dataset-candidate"));
router.get("/admin/dataset-stats", adminProxy("dataset-stats"));
router.get("/admin/reviewer-logs", adminProxy("reviewer-logs"));
router.get("/admin/api-analytics", adminProxy("api-analytics"));
router.get("/admin/models", adminProxy("models"));
router.get("/admin/training-jobs", adminProxy("training-jobs"));
router.get("/admin/dataset-versions", adminProxy("dataset-versions"));
router.get("/admin/dataset-download", adminProxy("dataset-download"));
router.get("/admin/system-health", adminProxy("system-health"));

export default router;
