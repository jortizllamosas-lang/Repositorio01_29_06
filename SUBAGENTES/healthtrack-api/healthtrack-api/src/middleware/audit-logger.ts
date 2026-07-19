import type { Request, Response, NextFunction } from "express";
import { getDb } from "../database/connection";

export function auditLogger(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const originalSend = res.json.bind(res);

  res.json = function (body: unknown) {
    // Solo registrar mutaciones exitosas
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      res.statusCode < 400
    ) {
      try {
        const db = getDb();
        // req.originalUrl preserva la ruta completa desde la raíz de la app
        // (a diferencia de req.path, que dentro de un router montado queda
        // recortado del prefijo del mount point, ej. "/api/alerts").
        // Se descarta la query string antes de partir el path en segmentos.
        const fullPath = req.originalUrl.split("?")[0];
        const parts = fullPath.split("/").filter(Boolean);
        // parts[0] es siempre "api" (prefijo de montaje), parts[1] es el recurso
        // real (ej. "patients", "alerts"), y parts[2] es el id del recurso si existe.
        const resource = parts[1] || "unknown";
        const resourceId = parts[2] ? parseInt(parts[2], 10) : null;

        db.prepare(
          `
          INSERT INTO audit_log (user_id, action, resource, resource_id, details, ip_address)
          VALUES (?, ?, ?, ?, ?, ?)
        `,
        ).run(
          req.user?.userId ?? null,
          req.method,
          resource,
          isNaN(resourceId as number) ? null : resourceId,
          JSON.stringify({ path: req.originalUrl, body: req.body }),
          req.ip || req.connection.remoteAddress || null,
        );
      } catch {
        // No interrumpir la respuesta por errores de audit
      }
    }
    return originalSend(body);
  };

  next();
}
