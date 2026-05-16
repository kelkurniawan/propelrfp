import Link from "next/link";

const TABS = [
  { href: "/settings/org", label: "Organization" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/billing", label: "Billing" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl p-6 md:p-10">
      <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#162B44" }}>
        Settings
      </h1>
      <nav className="mt-4 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-foreground hover:border-primary"
          >
            {t.label}
          </Link>
        ))}
      </nav>
      <div className="mt-8">{children}</div>
    </div>
  );
}
