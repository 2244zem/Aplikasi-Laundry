'use client';

type SkeletonBlockProps = {
  className?: string;
};

export function SkeletonBlock({ className = '' }: SkeletonBlockProps) {
  return <span className={`skeleton ${className}`} aria-hidden />;
}

export function MetricSkeleton() {
  return (
    <article className="panel metric-card skeleton-card" aria-hidden>
      <SkeletonBlock className="skeleton-label" />
      <SkeletonBlock className="skeleton-value" />
      <SkeletonBlock className="skeleton-line short" />
    </article>
  );
}

export function ListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-list" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div className="skeleton-row" key={index}>
          <SkeletonBlock className="skeleton-avatar" />
          <div>
            <SkeletonBlock className="skeleton-line" />
            <SkeletonBlock className="skeleton-line short" />
          </div>
        </div>
      ))}
    </div>
  );
}
