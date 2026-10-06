import { PaginaSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PaginaSkeleton cards={3} linhas={8} />;
}
