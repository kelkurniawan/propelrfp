interface StatsCardsProps {
  activeProposals: number;
  kbDocCount: number;
  winRate: number | null;
  timeSavedHours: number;
}

export function StatsCards({
  activeProposals,
  kbDocCount,
  winRate,
  timeSavedHours,
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Active Proposals
        </p>
        <p className="mt-1 text-2xl font-semibold">{activeProposals}</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          KB Documents
        </p>
        <p className="mt-1 text-2xl font-semibold">{kbDocCount}</p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Win Rate
        </p>
        <p className="mt-1 text-2xl font-semibold">
          {winRate === null ? "—" : `${Math.round(winRate)}%`}
        </p>
      </div>
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Est. Time Saved
        </p>
        <p className="mt-1 text-2xl font-semibold">{timeSavedHours}h</p>
      </div>
    </div>
  );
}
