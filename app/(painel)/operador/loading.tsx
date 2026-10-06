import { PaginaSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PaginaSkeleton cards={0} linhas={4} />;
}
