import { Skeleton, CardSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-8 w-72 mb-6" />
      <Skeleton className="h-9 w-80 mb-5" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="space-y-5">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </>
  );
}
