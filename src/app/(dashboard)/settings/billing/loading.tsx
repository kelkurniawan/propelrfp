export default function BillingLoading() {
  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10 animate-pulse">
      <div className="h-8 w-36 rounded bg-gray-200" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-28 rounded-lg bg-gray-200" />
        ))}
      </div>
      <div className="mt-10 h-6 w-28 rounded bg-gray-200" />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-48 rounded-lg bg-gray-200" />
        ))}
      </div>
    </main>
  );
}
