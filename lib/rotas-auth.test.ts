import { describe, it, expect } from "vitest";
import {
  DESTINO_PADRAO,
  ROTA_MFA,
  destinoSeguro,
  ehOuComeca,
  precisaSegundoFator,
  rotaDeEntrada,
  rotaDeMfa,
  rotaExigeSegundoFator,
  rotaPublica,
} from "./rotas-auth";

describe("ehOuComeca", () => {
  it("casa o caminho exato e os filhos, nunca um prefixo solto", () => {
    expect(ehOuComeca("/vitrine", ["/vitrine"])).toBe(true);
    expect(ehOuComeca("/vitrine/loja", ["/vitrine"])).toBe(true);
    expect(ehOuComeca("/vitrine-admin", ["/vitrine"])).toBe(false);
  });
});

describe("rotaPublica", () => {
  it("abre sem sessão o que precisa abrir sem sessão", () => {
    for (const rota of ["/", "/login", "/signup", "/recuperar", "/auth/callback", "/auth/reset", "/vitrine/minha-loja", "/privacidade", "/termos"]) {
      expect(rotaPublica(rota), rota).toBe(true);
    }
  });

  it("inclui a calculadora pública e a verificação de saúde", () => {
    expect(rotaPublica("/calculadora")).toBe(true);
    expect(rotaPublica("/api/saude")).toBe(true);
  });

  it("webhooks, cron e relatório de CSP chegam sem sessão", () => {
    for (const rota of ["/api/cron/shopee", "/api/mercadolivre/notificacoes", "/api/cobranca/webhook", "/api/csp-report", "/api/vitrine/pedido"]) {
      expect(rotaPublica(rota), rota).toBe(true);
    }
  });

  it("o painel continua exigindo sessão", () => {
    for (const rota of ["/dashboard", "/vendas", "/configuracoes", "/admin", "/aguardando", "/operador", "/api/marketplace/sincronizar"]) {
      expect(rotaPublica(rota), rota).toBe(false);
    }
  });

  it("a tela do código exige sessão", () => {
    expect(rotaPublica(ROTA_MFA)).toBe(false);
  });

  it("não libera rota que só começa parecido", () => {
    expect(rotaPublica("/loginx")).toBe(false);
    expect(rotaPublica("/calculadora-interna")).toBe(false);
    expect(rotaPublica("/api/saudeX")).toBe(false);
  });
});

describe("rotaDeEntrada", () => {
  it("é só login e cadastro", () => {
    expect(rotaDeEntrada("/login")).toBe(true);
    expect(rotaDeEntrada("/signup")).toBe(true);
  });

  // Regra documentada no CLAUDE.md: com sessão (do link de recuperação), ser rota de entrada
  // mandaria para /dashboard e a redefinição ficaria inalcançável.
  it("/recuperar e /auth/reset são públicas e NÃO são rota de entrada", () => {
    for (const rota of ["/recuperar", "/auth/reset"]) {
      expect(rotaPublica(rota), rota).toBe(true);
      expect(rotaDeEntrada(rota), rota).toBe(false);
    }
  });

  it("a tela do código não é rota de entrada (quem está nela tem sessão)", () => {
    expect(rotaDeEntrada(ROTA_MFA)).toBe(false);
  });
});

describe("rotaExigeSegundoFator", () => {
  it("todo o painel exige", () => {
    for (const rota of ["/dashboard", "/configuracoes", "/admin/contas", "/aguardando", "/operador"]) {
      expect(rotaExigeSegundoFator(rota), rota).toBe(true);
    }
  });

  it("a própria tela do código não exige (é onde ele é dado)", () => {
    expect(rotaDeMfa("/auth/mfa")).toBe(true);
    expect(rotaExigeSegundoFator("/auth/mfa")).toBe(false);
  });

  // A GoTrue recusa trocar senha em sessão aal1 de quem tem fator: passar antes pelo código.
  it("/auth/reset exige, mesmo sendo pública", () => {
    expect(rotaExigeSegundoFator("/auth/reset")).toBe(true);
  });

  it("rotas públicas sem sessão não exigem", () => {
    for (const rota of ["/", "/login", "/signup", "/recuperar", "/auth/callback", "/vitrine/x", "/api/cron/shopee", "/calculadora"]) {
      expect(rotaExigeSegundoFator(rota), rota).toBe(false);
    }
  });
});

describe("precisaSegundoFator", () => {
  it("só quando a conta tem fator e a sessão ainda está no primeiro", () => {
    expect(precisaSegundoFator({ atual: "aal1", proximo: "aal2" })).toBe(true);
    expect(precisaSegundoFator({ atual: "aal2", proximo: "aal2" })).toBe(false);
    expect(precisaSegundoFator({ atual: "aal1", proximo: "aal1" })).toBe(false);
  });

  it("sem informação não bloqueia (é roteamento; a trava de verdade é a GoTrue)", () => {
    expect(precisaSegundoFator({})).toBe(false);
    expect(precisaSegundoFator({ atual: null, proximo: null })).toBe(false);
  });

  it("sessão sem aal no JWT e conta com fator ainda precisa do código", () => {
    expect(precisaSegundoFator({ atual: null, proximo: "aal2" })).toBe(true);
  });
});

describe("destinoSeguro", () => {
  it("mantém caminho interno com a busca", () => {
    expect(destinoSeguro("/vendas")).toBe("/vendas");
    expect(destinoSeguro("/vendas?periodo=mes&canal=shopee")).toBe("/vendas?periodo=mes&canal=shopee");
    expect(destinoSeguro("/auth/reset")).toBe("/auth/reset");
  });

  it("vazio cai no padrão", () => {
    expect(destinoSeguro(null)).toBe(DESTINO_PADRAO);
    expect(destinoSeguro(undefined)).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro(null, "/configuracoes")).toBe("/configuracoes");
  });

  it("recusa qualquer destino fora do domínio (redirecionamento aberto)", () => {
    for (const ruim of [
      "https://golpe.com",
      "http://golpe.com/dashboard",
      "//golpe.com",
      "//golpe.com/dashboard",
      "/\\golpe.com",
      "/\t/golpe.com",
      "/\n/golpe.com",
      "javascript:alert(1)",
      "golpe.com",
      " /dashboard",
    ]) {
      expect(destinoSeguro(ruim), JSON.stringify(ruim)).toBe(DESTINO_PADRAO);
    }
  });

  it("não volta para a tela do código nem para o login (laço)", () => {
    expect(destinoSeguro("/auth/mfa")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/auth/mfa?next=/vendas")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/login")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/signup")).toBe(DESTINO_PADRAO);
  });

  it("não volta para rota de API (a requisição desviada pode ter sido um fetch)", () => {
    expect(destinoSeguro("/api/marketplace/sincronizar")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/_next/data/x.json")).toBe(DESTINO_PADRAO);
    expect(destinoSeguro("/apis")).toBe("/apis");
  });

  it("descarta o fragmento", () => {
    expect(destinoSeguro("/vendas#topo")).toBe("/vendas");
  });
});
