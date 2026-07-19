import { Router } from "express";
import { authenticate, authorize } from "../auth/auth.middleware";
import { getAlertsByPatient, acknowledgeAlert } from "./alerts.service";
import type { Request, Response } from "express";

const router = Router();

router.get("/:patientId", authenticate, (req: Request, res: Response) => {
  const patientId = parseInt(req.params.patientId, 10);
  if (isNaN(patientId)) {
    res.status(400).json({ error: "Invalid patientId" });
    return;
  }

  try {
    const alerts = getAlertsByPatient(patientId, req.user!);
    if (!alerts) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }
    res.json({ data: alerts, count: alerts.length });
  } catch {
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

// Acknowledging an alert has clinical semantics: it confirms a professional
// reviewed it. Patients may still VIEW their own alerts (GET above), but only
// doctor/admin may acknowledge them.
router.patch(
  "/:id/acknowledge",
  authenticate,
  authorize("admin", "doctor"),
  (req: Request, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    try {
      const alert = acknowledgeAlert(id, req.user!);
      if (!alert) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }
      res.json({ data: alert });
    } catch {
      res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  },
);

export default router;
