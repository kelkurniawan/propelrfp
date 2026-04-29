import { NextResponse } from "next/server";
import type { ApiResponse } from "@/types";

export function ok<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, error: null }, { status });
}

export function fail(code: string, message: string, status = 400): NextResponse<ApiResponse<null>> {
  return NextResponse.json({ data: null, error: { code, message } }, { status });
}

export const ApiErrors = {
  Unauthorized: () => fail("unauthorized", "Authentication required", 401),
  Forbidden: () => fail("forbidden", "You do not have permission to do this", 403),
  NotFound: (resource = "Resource") => fail("not_found", `${resource} not found`, 404),
  ValidationFailed: (message: string) => fail("validation_failed", message, 400),
  LimitReached: (message: string) => fail("limit_reached", message, 429),
  InternalError: () => fail("internal_error", "Something went wrong", 500),
} as const;
