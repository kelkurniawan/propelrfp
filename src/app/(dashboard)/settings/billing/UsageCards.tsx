interface UsageEntry {
  current: number;
  limit: number;
}

interface Props {
  usage: {
    proposals: UsageEntry;
    storage_bytes: UsageEntry;
    members: UsageEntry;
  };
}

function formatStorage(bytes: number): string {
  if (!isFinite(bytes)) return "∞";
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

function UsageCard({
  label,
  current,
  limit,
  display,
}: {
  label: string;
  current: number;
  limit: number;
  display: (n: number) => string;
}) {
  const atLimit = isFinite(limit) && current >= limit;
  const pct = isFinite(limit) && limit > 0 ? Math.min(100, (current / limit) * 100) : 0;

  return (
    <div
      className={`rounded-lg border p-5 space-y-3 ${
        atLimit ? "border-amber-400 bg-amber-50" : "border-border bg-card"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className={`text-2xl font-bold ${atLimit ? "text-amber-800" : ""}`}>
          {display(current)}
        </span>
        <span className="text-sm text-muted-foreground">
          / {isFinite(limit) ? display(limit) : "∞"}
        </span>
      </div>
      <p className={`text-sm font-medium ${atLimit ? "text-amber-700" : ""}`}>{label}</p>
      {isFinite(limit) && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${atLimit ? "bg-amber-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function UsageCards({ usage }: Props) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Current usage</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <UsageCard
          label="Proposals"
          current={usage.proposals.current}
          limit={usage.proposals.limit}
          display={String}
        />
        <UsageCard
          label="Storage"
          current={usage.storage_bytes.current}
          limit={usage.storage_bytes.limit}
          display={formatStorage}
        />
        <UsageCard
          label="Team members"
          current={usage.members.current}
          limit={usage.members.limit}
          display={String}
        />
      </div>
    </div>
  );
}
