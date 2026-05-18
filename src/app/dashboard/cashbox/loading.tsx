export default function CashboxLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-9 w-32 rounded-lg bg-muted/40" />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border bg-muted/20" />
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
