import { CardSkeleton } from "@/components/ui/Skeleton";

export default function Carregando() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-5">
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
