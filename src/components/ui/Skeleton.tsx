import { cn } from './cn';

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div aria-hidden className={cn('gg-skeleton', className)} style={style} />;
}

export function SkeletonPage({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 py-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-1/2 max-w-sm" />
      <div className="mt-4 flex flex-col gap-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
