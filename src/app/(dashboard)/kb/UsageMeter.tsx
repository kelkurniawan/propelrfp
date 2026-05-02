export function UsageMeter({
  usedBytes,
  limitMb,
}: {
  usedBytes: number;
  limitMb: number;
}) {
  if (!isFinite(limitMb)) return null;

  const limitBytes = limitMb * 1024 * 1024;
  const pct = Math.min((usedBytes / limitBytes) * 100, 100);
  const usedMb = (usedBytes / 1024 / 1024).toFixed(0);
  const nearLimit = pct >= 90;

  return (
    <div className="mt-4">
      <div className="mb-1 flex justify-between text-sm text-muted-foreground">
        <span>Storage</span>
        <span className={nearLimit ? "font-medium text-destructive" : ""}>
          {usedMb} MB / {limitMb} MB
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${nearLimit ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}
