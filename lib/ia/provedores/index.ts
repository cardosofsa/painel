import { chamarGemini, listarModelosGemini } from "../gemini";
import { chamarOpenAI, listarModelosOpenAI } from "./openai";
import { chamarAnthropic, listarModelosAnthropic } from "./anthropic";
import { chamarOpenRouter, listarModelosOpenRouter } from "./openrouter";
import type { CredencialIA, OpcoesProvedor, ProvedorId } from "./tipos";

export { PROVEDORES_IDS, type CredencialIA, type ProvedorId } from "./tipos";

export { PROVEDORES, ORDEM_PROVEDORES } from "./catalogo";

/** Faz a chamada no provedor da credencial. Lança `ErroIA`. */
export function chamarProvedor(cred: CredencialIA, prompt: string, o: OpcoesProvedor): Promise<string> {
  switch (cred.provedor) {
    case "gemini":
      return chamarGemini(prompt, o, { chave: cred.chave, modelo: cred.modelo });
    case "openai":
      return chamarOpenAI(prompt, o, cred);
    case "anthropic":
      return chamarAnthropic(prompt, o, cred);
    case "openrouter":
      return chamarOpenRouter(prompt, o, cred);
  }
}

/** Testa a chave e devolve os modelos disponíveis. Lança `ErroIA` se a chave não valer. */
export function listarModelos(provedor: ProvedorId, chave: string): Promise<string[]> {
  switch (provedor) {
    case "gemini":
      return listarModelosGemini(chave);
    case "openai":
      return listarModelosOpenAI(chave);
    case "anthropic":
      return listarModelosAnthropic(chave);
    case "openrouter":
      return listarModelosOpenRouter(chave);
  }
}
