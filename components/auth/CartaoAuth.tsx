import type { ReactNode } from "react";
import { Brain } from "lucide-react";

/**
 * Casca das telas de autenticação (entrar, criar conta, recuperar senha, redefinir senha).
 *
 * Existe porque o mesmo cartão centralizado com a marca estava copiado em `/login` e
 * `/signup`, e as telas novas seriam a terceira e a quarta cópia.
 */
export function CartaoAuth({
  titulo,
  descricao,
  children,
  rodape,
}: {
  titulo: string;
  descricao?: string;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-accent-on shrink-0">
            <Brain size={16} strokeWidth={2.25} />
          </span>
          <span className="font-semibold tracking-tight text-text-primary text-lg">Segundo Cérebro</span>
        </div>

        <div className="bg-surface-1 border border-border rounded-lg shadow-elev-1 p-6">
          <h1 className="text-base font-semibold text-text-primary mb-1">{titulo}</h1>
          {descricao && <p className="text-sm text-text-secondary mb-5">{descricao}</p>}
          {!descricao && <div className="mb-5" />}
          {children}
        </div>

        {rodape && <div className="text-center text-xs text-text-secondary mt-4">{rodape}</div>}
      </div>
    </div>
  );
}

/**
 * Mensagem de erro do formulário. `role="alert"` é o que faz o leitor de tela anunciar o
 * problema — antes o erro aparecia só visualmente e era silencioso.
 */
export function ErroAuth({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-sm text-negative mb-4">
      {children}
    </p>
  );
}
