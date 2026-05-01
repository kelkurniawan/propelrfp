import Link from "next/link";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F7F9FB] p-6">
      <div className="w-full max-w-md">
        <Link href="/" className="mb-8 flex items-center justify-center gap-2.5">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-white"
            style={{ background: "linear-gradient(135deg, #162B44, #2E75B6)" }}
          >
            P
          </div>
          <span className="text-2xl font-bold tracking-tight" style={{ color: "#162B44" }}>
            PropelRFP
          </span>
        </Link>
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#162B44" }}>
            {title}
          </h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </main>
  );
}
