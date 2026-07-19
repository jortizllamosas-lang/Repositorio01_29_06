import { describe, it, expect, vi } from "vitest";
import { authorize } from "../src/auth/auth.middleware";
import type { Request, Response, NextFunction } from "express";
import type { TokenPayload } from "../src/auth/auth.types";

// These tests cover authorize() directly (no supertest/HTTP layer is used elsewhere
// in this repo). They exercise the exact role set used by
// `PATCH /api/alerts/:id/acknowledge` (authorize("admin", "doctor")), which is the
// mechanism that now prevents a `patient` from acknowledging alerts (security
// finding #20 — acknowledging an alert has clinical semantics, so only a
// professional may do it).
function mockReq(user?: TokenPayload): Request {
  return { user } as unknown as Request;
}

function mockRes(): Response {
  const res = {} as Response;
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("authorize middleware", () => {
  it("should reject a patient with 403 for an admin/doctor-only route", () => {
    const req = mockReq({
      userId: 1,
      email: "patient@test.com",
      role: "patient",
      name: "Patient",
    });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    authorize("admin", "doctor")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Insufficient permissions",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should allow a doctor through for an admin/doctor-only route", () => {
    const req = mockReq({
      userId: 2,
      email: "doctor@test.com",
      role: "doctor",
      name: "Doctor",
    });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    authorize("admin", "doctor")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should allow an admin through for an admin/doctor-only route", () => {
    const req = mockReq({
      userId: 3,
      email: "admin@test.com",
      role: "admin",
      name: "Admin",
    });
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    authorize("admin", "doctor")(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should reject with 401 when there is no authenticated user", () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = vi.fn() as unknown as NextFunction;

    authorize("admin", "doctor")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
