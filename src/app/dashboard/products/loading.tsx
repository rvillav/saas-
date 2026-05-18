export default function ProductsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-9 w-32 rounded-lg bg-muted/40" />
        <div className="h-9 w-36 rounded-lg bg-muted/40" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border bg-muted/20" />
        ))}
      </div>
      <div className="h-10 max-w-xs rounded-md bg-muted/30" />
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
