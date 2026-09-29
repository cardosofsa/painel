"use client";

import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "./Button";

/**
 * Seletor de imagem no lugar do `<input type="file">` nativo.
 *
 * O nativo desenha "Escolher arquivo" + "Nenhum arquivo escolhido" numa linha sem quebra,
 * o que estourava a largura do modal de Produtos e criava rolagem lateral. Aqui o input
 * fica escondido e só o botão aparece; o texto de apoio trunca em vez de empurrar o layout.
 */
export function CampoArquivo({
  onArquivo,
  disabled = false,
  rotulo = "Escolher imagem",
  aceita = "image/*",
}: {
  onArquivo: (file: File) => void;
  disabled?: boolean;
  rotulo?: string;
  aceita?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={aceita}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onArquivo(file);
          e.target.value = "";
        }}
      />
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => ref.current?.click()}>
        <ImagePlus size={14} />
        {rotulo}
      </Button>
    </>
  );
}
