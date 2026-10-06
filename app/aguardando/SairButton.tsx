"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

export function SairButton() {
  const router = useRouter();

  async function sair() {
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <Button variant="secondary" className="w-full" onClick={sair}>
      Sair
    </Button>
  );
}
