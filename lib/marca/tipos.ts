import type { FichaMarca, TipoImagemMarca } from "./ficha";
import type { PlataformaMarcaId } from "./plataformas";

/** Linha de `perfis_marca` como a tela usa. */
export interface PerfilMarca {
  id: string;
  nome: string;
  plataforma: PlataformaMarcaId;
  loja_id: string | null;
  nicho: string | null;
  link_loja: string | null;
  logo_path: string | null;
  referencias: string[];
  termos_proibidos: string[];
}

export interface MemoriaMarca {
  id: string;
  perfil_id: string | null;
  tipo: "preferencia" | "regra" | "aprendizado";
  texto: string;
  origem: "usuario" | "ia";
  ativo: boolean;
}

export interface FichaSalva {
  id: string;
  perfil_id: string;
  tipo_imagem: TipoImagemMarca;
  versao: number;
  dados: FichaMarca;
  ativa: boolean;
  origem: "usuario" | "ia_capas" | "ajuste_ia";
  nota: string | null;
  criado_em: string;
}

export interface LojaParaMarca {
  id: string;
  nome: string;
  canal: string | null;
}

/** Endereço público de um arquivo do bucket `produtos` (o bucket é público de propósito). */
export function urlPublicaImagem(caminho: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/produtos/${caminho}`;
}
