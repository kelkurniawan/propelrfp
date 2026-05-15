import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "@/lib/auth/requireRole";
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

export function withErrorHandling(
  handler: (
    req: Request,
    ctx: { params: Promise<Record<string, string>> }
  ) => Promise<NextResponse>
) {
  return async (
    req: Request,
    ctx: { params: Promise<Record<string, string>> }
  ): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ZodError) {
        const msg = err.issues.map((i) => i.message).join(", ");
        return fail("validation_failed", msg, 400);
      }
      if (err instanceof ApiError) {
        return NextResponse.json(
          { data: null, error: { code: err.code, message: err.message, ...err.extra } },
          { status: err.status }
        );
      }
      console.error("[api] unhandled error", err);
      return ApiErrors.InternalError();
    }
  };
}
