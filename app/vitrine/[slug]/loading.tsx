import { Skeleton } from "@/components/ui/Skeleton";

/**
 * A vitrine é uma página de venda aberta por link: sem esqueleto, o cliente encara uma
 * tela branca até a RPC responder, e tela branca em landing page é abandono.
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <Skeleton className="h-8 w-56 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="aspect-square w-full rounded-lg mb-2" />
              <Skeleton className="h-4 w-3/4 mb-1" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
