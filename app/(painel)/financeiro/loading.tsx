import { Skeleton, CardSkeleton, TableSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-8 w-56 mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="rounded-lg bg-surface-1 border border-border shadow-elev-1">
        <TableSkeleton rows={8} />
      </div>
    </>
  );
}
