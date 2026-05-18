export default function MovementsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-9 w-36 rounded-lg bg-muted/40" />
        <div className="h-9 w-36 rounded-lg bg-muted/40" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border bg-muted/20" />
        ))}
      </div>
      <div className="rounded-xl border bg-card">
        <div className="p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded-md bg-muted/30" />
          ))}
        </div>
      </div>
    </div>
  );
}
