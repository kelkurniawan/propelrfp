export default function DashboardLoading() {
  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10 animate-pulse">
      <div className="h-8 w-40 rounded bg-gray-200" />
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg bg-gray-200" />
        ))}
      </div>
      <div className="mt-8 h-5 w-28 rounded bg-gray-200" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-lg bg-gray-200" />
        ))}
      </div>
    </main>
  );
}
