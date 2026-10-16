import { PaginaSkeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return <PaginaSkeleton cards={4} linhas={8} />;
}
