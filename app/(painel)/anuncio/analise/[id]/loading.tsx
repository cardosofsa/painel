import { CardSkeleton } from "@/components/ui/Skeleton";

export default function Carregando() {
  return (
    <div className="space-y-5">
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
