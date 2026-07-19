import { describe, it, expect } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { auditLogger } from "../src/middleware/audit-logger";
import { getDb } from "../src/database/connection";
import { createTestUser } from "./setup";

/**
 * Construye un mock mínimo de Request/Response de Express suficiente para
 * ejercitar `auditLogger`, simulando el recorte de `req.path` que hace Express
 * cuando la request pasa por un router montado con prefijo (ej. `/api/alerts`),
 * mientras que `req.originalUrl` conserva la ruta completa desde la raíz.
 */
function runAuditLogger(params: {
  method: string;
  originalUrl: string;
  path: string;
  userId?: number;
  body?: unknown;
  statusCode?: number;
}): void {
  const req = {
    method: params.method,
    originalUrl: params.originalUrl,
    path: params.path,
    user: params.userId
      ? {
          userId: params.userId,
          email: "x@test.com",
          role: "patient",
          name: "X",
        }
      : undefined,
    body: params.body ?? {},
    ip: "127.0.0.1",
    connection: { remoteAddress: "127.0.0.1" },
  } as unknown as Request;

  const res = {
    statusCode: params.statusCode ?? 200,
    json(this: Response, body: unknown) {
      return body;
    },
  } as unknown as Response;

  const next: NextFunction = () => {};

  auditLogger(req, res, next);
  // Simula el envío de la respuesta, que es lo que dispara el registro de auditoría.
  res.json({ data: {} });
}

describe("auditLogger middleware", () => {
  it("should record the correct resource and resource_id using req.originalUrl (not the router-trimmed req.path) for a mutation on a mounted router", () => {
    const userId = createTestUser({
      email: "audit-doctor@test.com",
      password: "pass",
      role: "doctor",
      name: "Audit Doctor",
    });

    // Simula PATCH /api/alerts/45/acknowledge llegando desde dentro del router
    // de alerts, donde Express ya recortó req.path a "/45/acknowledge".
    runAuditLogger({
      method: "PATCH",
      originalUrl: "/api/alerts/45/acknowledge",
      path: "/45/acknowledge",
      userId,
    });

    const row = getDb()
      .prepare(
        "SELECT resource, resource_id FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(userId) as { resource: string; resource_id: number | null };

    expect(row.resource).toBe("alerts");
    expect(row.resource_id).toBe(45);
  });

  it("should record resource 'patients' and resource_id 7 for PUT /api/patients/7", () => {
    const userId = createTestUser({
      email: "audit-doctor2@test.com",
      password: "pass",
      role: "doctor",
      name: "Audit Doctor 2",
    });

    runAuditLogger({
      method: "PUT",
      originalUrl: "/api/patients/7",
      path: "/7",
      userId,
    });

    const row = getDb()
      .prepare(
        "SELECT resource, resource_id FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(userId) as { resource: string; resource_id: number | null };

    expect(row.resource).toBe("patients");
    expect(row.resource_id).toBe(7);
  });

  it("should record resource 'health-metrics' and resource_id null for POST /api/health-metrics (no id in the path)", () => {
    const userId = createTestUser({
      email: "audit-patient@test.com",
      password: "pass",
      role: "patient",
      name: "Audit Patient",
    });

    runAuditLogger({
      method: "POST",
      originalUrl: "/api/health-metrics",
      path: "/",
      userId,
    });

    const row = getDb()
      .prepare(
        "SELECT resource, resource_id FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(userId) as { resource: string; resource_id: number | null };

    expect(row.resource).toBe("health-metrics");
    expect(row.resource_id).toBeNull();
  });

  it("should record resource 'auth' for POST /api/auth/login (no numeric id segment)", () => {
    runAuditLogger({
      method: "POST",
      originalUrl: "/api/auth/login",
      path: "/login",
    });

    const row = getDb()
      .prepare(
        "SELECT resource, resource_id FROM audit_log ORDER BY id DESC LIMIT 1",
      )
      .get() as { resource: string; resource_id: number | null };

    expect(row.resource).toBe("auth");
    expect(row.resource_id).toBeNull();
  });

  it("should strip the query string from originalUrl before parsing segments", () => {
    const userId = createTestUser({
      email: "audit-admin@test.com",
      password: "pass",
      role: "admin",
      name: "Audit Admin",
    });

    runAuditLogger({
      method: "DELETE",
      originalUrl: "/api/patients/12?force=true",
      path: "/12",
      userId,
    });

    const row = getDb()
      .prepare(
        "SELECT resource, resource_id, details FROM audit_log WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(userId) as {
      resource: string;
      resource_id: number | null;
      details: string;
    };

    expect(row.resource).toBe("patients");
    expect(row.resource_id).toBe(12);
    const details = JSON.parse(row.details) as { path: string };
    expect(details.path).toBe("/api/patients/12?force=true");
  });

  it("should not record anything for a failed mutation (statusCode >= 400)", () => {
    const before = getDb()
      .prepare("SELECT COUNT(*) as count FROM audit_log")
      .get() as { count: number };

    runAuditLogger({
      method: "POST",
      originalUrl: "/api/patients",
      path: "/",
      statusCode: 400,
    });

    const after = getDb()
      .prepare("SELECT COUNT(*) as count FROM audit_log")
      .get() as { count: number };

    expect(after.count).toBe(before.count);
  });
});
