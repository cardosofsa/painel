import { Skeleton, CardSkeleton, TableSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-8 w-48 mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <div className="rounded-lg bg-surface-1 border border-border">
        <TableSkeleton rows={8} />
      </div>
    </>
  );
}
