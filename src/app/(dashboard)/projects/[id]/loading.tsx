export default function ProjectEditorLoading() {
  return (
    <div className="flex h-screen animate-pulse">
      <aside className="w-64 shrink-0 border-r p-4 space-y-3">
        <div className="h-5 w-3/4 rounded bg-gray-200" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-gray-200" />
        ))}
      </aside>
      <div className="flex-1 p-6 space-y-4">
        <div className="h-7 w-1/2 rounded bg-gray-200" />
        <div className="h-4 w-full rounded bg-gray-200" />
        <div className="h-4 w-5/6 rounded bg-gray-200" />
        <div className="mt-6 h-64 rounded-lg bg-gray-200" />
      </div>
    </div>
  );
}
