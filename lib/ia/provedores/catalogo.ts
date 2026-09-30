/**
 * Dados de APRESENTAÇÃO dos provedores (nome, exemplo de modelo, onde criar a chave).
 * Módulo sem dependência de servidor: pode ser importado por componentes do navegador.
 * Os endereços de API, esses sim, moram só nos módulos de cada provedor.
 */

export type ProvedorId = "gemini" | "openai" | "anthropic" | "openrouter";

export const PROVEDORES: Record<ProvedorId, { nome: string; exemploModelo: string; ondeCriarChave: string }> = {
  gemini: {
    nome: "Google Gemini",
    exemploModelo: "gemini-3.5-flash-lite",
    ondeCriarChave: "aistudio.google.com/apikey",
  },
  openai: { nome: "OpenAI (ChatGPT)", exemploModelo: "gpt-4.1-mini", ondeCriarChave: "platform.openai.com/api-keys" },
  anthropic: {
    nome: "Anthropic (Claude)",
    exemploModelo: "claude-haiku-4-5-20251001",
    ondeCriarChave: "console.anthropic.com/settings/keys",
  },
  openrouter: {
    nome: "OpenRouter",
    exemploModelo: "google/gemini-2.5-flash-lite",
    ondeCriarChave: "openrouter.ai/keys",
  },
};

export const ORDEM_PROVEDORES: ProvedorId[] = ["gemini", "openai", "anthropic", "openrouter"];
