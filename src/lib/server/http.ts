import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
    public extra?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export const ok = (data: Record<string, unknown> = {}) => NextResponse.json({ ok: true, ...data });
export const fail = (code: string, status = 400, extra?: Record<string, unknown>) =>
  NextResponse.json({ error: code, ...extra }, { status });

export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError("invalid_input");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function route<A extends any[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ApiError) return NextResponse.json({ error: e.code, ...e.extra }, { status: e.status });
      console.error("[api]", e);
      return NextResponse.json({ error: "generic" }, { status: 500 });
    }
  };
}

export function getOrigin(req: Request): string {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

export const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const num = (v: unknown, d = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : d;
};
