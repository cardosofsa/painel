import { CardSkeleton, Skeleton } from "@/components/ui/Skeleton";

/** Mesmo desenho da tela pronta (título, grupos, sub-abas e cartões), para nada pular ao carregar. */
export default function Loading() {
  return (
    <>
      <Skeleton className="h-8 w-48 mb-6" />
      <div className="flex gap-4 border-b border-border pb-2.5 mb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-20" />
        ))}
      </div>
      <div className="flex gap-2 mb-5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="lg:col-span-2">
          <CardSkeleton />
        </div>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </>
  );
}
