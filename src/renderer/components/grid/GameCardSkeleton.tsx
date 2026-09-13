export function GameCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-surface-100/20 bg-surface-200/80">
      {/* Cover placeholder */}
      <div className="aspect-[3/4] skeleton" />

      {/* Info placeholder */}
      <div className="p-3 space-y-2">
        <div className="h-4 skeleton rounded w-3/4" />
        <div className="h-3 skeleton rounded w-1/2" />
      </div>
    </div>
  )
}
