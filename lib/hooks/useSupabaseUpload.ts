"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

interface EnviarOpcoes {
  maxSizeMb?: number;
  tiposAceitos?: string[];
  prefixo?: string;
}

interface ResultadoUpload {
  path: string;
  publicUrl: string;
}

/** Hook compartilhado para upload de arquivos ao Supabase Storage (produtos, logos, notas fiscais). */
export function useSupabaseUpload(bucket: string) {
  const [enviando, setEnviando] = useState(false);

  async function enviar(file: File, opcoes: EnviarOpcoes = {}): Promise<ResultadoUpload | null> {
    const { maxSizeMb = 5, tiposAceitos, prefixo = "arquivo" } = opcoes;

    if (tiposAceitos && !tiposAceitos.some((tipo) => file.type.startsWith(tipo))) {
      toast.error("Tipo de arquivo não suportado");
      return null;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast.error(`Arquivo muito grande (máx. ${maxSizeMb}MB)`);
      return null;
    }

    setEnviando(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada, faça login novamente");

      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${user.id}/${prefixo}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) throw new Error(error.message);

      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      return { path, publicUrl: data.publicUrl };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar arquivo");
      return null;
    } finally {
      setEnviando(false);
    }
  }

  return { enviar, enviando };
}
