export default function ProjectsLoading() {
  return (
    <main className="mx-auto max-w-5xl p-6 md:p-10 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 rounded bg-gray-200" />
        <div className="h-9 w-32 rounded bg-gray-200" />
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-gray-200" />
        ))}
      </div>
    </main>
  );
}
