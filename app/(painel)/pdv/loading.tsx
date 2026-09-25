import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton className="h-8 w-32 mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="hidden lg:block h-[calc(100vh-8rem)] w-full rounded-lg" />
      </div>
    </>
  );
}
