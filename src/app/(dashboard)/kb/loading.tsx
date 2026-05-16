export default function KbLoading() {
  return (
    <main className="mx-auto max-w-4xl p-8 md:p-12 animate-pulse">
      <div className="h-9 w-48 rounded bg-gray-200" />
      <div className="mt-4 h-3 w-full rounded-full bg-gray-200" />
      <div className="mt-6 h-36 rounded-lg border-2 border-dashed border-gray-200" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-gray-200" />
        ))}
      </div>
    </main>
  );
}
