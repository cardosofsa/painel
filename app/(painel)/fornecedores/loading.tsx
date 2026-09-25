import { Skeleton, TableSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-8 w-48 mb-6" />
      <div className="rounded-lg bg-surface-1 border border-border">
        <TableSkeleton rows={8} />
      </div>
    </>
  );
}
