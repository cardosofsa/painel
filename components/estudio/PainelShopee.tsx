"use client";
import { formatBRL } from "@/lib/format";

import { useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, Check, ChevronRight, Circle, PlugZap, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/Card";
import { FormField, Modal, inputClass } from "@/components/ui/Modal";
import { executarComToast } from "@/lib/acao-cliente";
import { conferirEntradaCriacao, type AtributoShopee, type CategoriaShopee } from "@/lib/marketplace/shopee-criar-puro";
import type { RascunhoAberto } from "@/app/(painel)/produtos/estudio/actions";
import {
  atributosDaCategoriaShopee,
  categoriasFilhas,
  criarNaoListadoShopee,
  removerItemShopee,
  salvarEscolhasShopee,
  verificarShopee,
  type ResultadoSonda,
} from "@/app/(painel)/produtos/estudio/shopee-actions";

type Valor = { valorId?: number; texto?: string };

function CampoAtributo({ a, valor, onChange }: { a: AtributoShopee; valor: Valor | undefined; onChange: (v: Valor) => void }) {
  const rotulo = `${a.nome}${a.obrigatorio ? " *" : ""}`;
  if (a.tipo === "lista" || a.tipo === "multipla") {
    return (
      <FormField label={rotulo} dica={a.tipo === "multipla" ? "A Shopee aceita vários; aqui você escolhe o principal." : undefined}>
        <select className={inputClass} value={valor?.valorId ?? ""} onChange={(e) => onChange(e.target.value ? { valorId: Number(e.target.value) } : {})}>
          <option value="">Escolher…</option>
          {a.valores.map((v) => (
            <option key={v.id} value={v.id}>
              {v.nome}
            </option>
          ))}
        </select>
      </FormField>
    );
  }
  return (
    <FormField label={rotulo}>
      <input className={inputClass} inputMode={a.tipo === "numero" ? "decimal" : undefined} value={valor?.texto ?? ""} maxLength={100} onChange={(e) => onChange(e.target.value ? { texto: e.target.value } : {})} />
    </FormField>
  );
}

/**
 * Criar o anúncio na Shopee como NÃO LISTADO. Nada é enviado sem os dois passos: testar a conexão
 * (só leitura) e confirmar no diálogo. Depois de criar, o servidor confere o status real e, se a
 * Shopee deixou o item à venda, tira do ar na hora.
 */
export function PainelShopee({ rascunho, onMudou }: { rascunho: RascunhoAberto; onMudou: () => void }) {
  const [pending, startTransition] = useTransition();
  const escolhidas = rascunho.estado.shopee;
  const item = rascunho.estado.itemShopee;
  const [sonda, setSonda] = useState<ResultadoSonda | null>(null);
  const [pilha, setPilha] = useState<CategoriaShopee[]>([]);
  const [opcoes, setOpcoes] = useState<CategoriaShopee[] | null>(null);
  const [categoria, setCategoria] = useState<{ id: number; nome: string } | null>(escolhidas ? { id: escolhidas.categoryId, nome: escolhidas.categoriaNome } : null);
  const [atributos, setAtributos] = useState<AtributoShopee[] | null>(null);
  const [mostrarOpcionais, setMostrarOpcionais] = useState(false);
  const [valores, setValores] = useState<Record<number, Valor>>(() => Object.fromEntries((escolhidas?.atributos ?? []).map((a) => [a.id, { valorId: a.valorId, texto: a.texto }])));
  const [canais, setCanais] = useState<Set<number>>(new Set(escolhidas?.canais ?? []));
  const [confirmando, setConfirmando] = useState<"criar" | "apagar" | null>(null);

  const capas = (rascunho.estado.capas ?? []).filter((c) => c.veredito === "aprovada" && c.finalPath);
  const pendencias = conferirEntradaCriacao({
    titulo: rascunho.titulo ?? "",
    descricao: rascunho.descricao ?? "",
    preco: rascunho.preco.preco,
    pesoG: rascunho.produto.pesoG,
    // A tela só sabe SE as três medidas existem; o servidor confere os valores de novo.
    dimensoesCm: rascunho.produto.temMedidas ? { altura: 1, largura: 1, comprimento: 1 } : { altura: null, largura: null, comprimento: null },
    categoryId: escolhidas?.categoryId ?? null,
    atributos: escolhidas?.atributos ?? [],
    obrigatorios: escolhidas?.obrigatorios ?? [],
    canais: escolhidas?.canais ?? [],
    imagens: capas.map((c) => c.finalPath as string),
    sku: null,
    estoque: rascunho.produto.estoque,
  });

  function testar() {
    startTransition(async () => {
      const r = await executarComToast(verificarShopee({ rascunho_id: rascunho.id }), { sucesso: "Conexão com a Shopee ok (só leitura)", erro: "Não foi possível falar com a Shopee." });
      if (r.ok) setSonda(r.dado);
    });
  }

  function abrirNivel(pai: number, novaPilha: CategoriaShopee[]) {
    startTransition(async () => {
      const r = await executarComToast(categoriasFilhas({ rascunho_id: rascunho.id, pai_id: pai }), { erro: "Não foi possível listar as categorias." });
      if (r.ok) {
        setOpcoes(r.dado);
        setPilha(novaPilha);
      }
    });
  }

  function escolher(c: CategoriaShopee) {
    if (c.temFilhas) return abrirNivel(c.id, [...pilha, c]);
    const caminho = [...pilha, c].map((x) => x.nome).join(" › ");
    startTransition(async () => {
      const r = await executarComToast(atributosDaCategoriaShopee({ rascunho_id: rascunho.id, category_id: c.id }), { erro: "Não foi possível ler os atributos da categoria." });
      if (!r.ok) return;
      setCategoria({ id: c.id, nome: caminho });
      setAtributos(r.dado);
      setValores({});
      setOpcoes(null);
    });
  }

  function voltar() {
    const nova = pilha.slice(0, -1);
    abrirNivel(nova.length ? nova[nova.length - 1].id : 0, nova);
  }

  function salvarEscolhas() {
    if (!categoria) return;
    const lista = atributos ?? [];
    startTransition(async () => {
      const r = await executarComToast(
        salvarEscolhasShopee({
          rascunho_id: rascunho.id,
          escolhas: {
            categoryId: categoria.id,
            categoriaNome: categoria.nome.slice(0, 200),
            atributos: Object.entries(valores)
              .filter(([, v]) => v.valorId != null || (v.texto ?? "").trim())
              .map(([id, v]) => ({ id: Number(id), ...(v.valorId != null ? { valorId: v.valorId } : {}), ...(v.texto?.trim() ? { texto: v.texto.trim() } : {}) })),
            // Sem a lista carregada (reedição), mantém os obrigatórios já conhecidos.
            obrigatorios: atributos ? lista.filter((a) => a.obrigatorio).map((a) => ({ id: a.id, nome: a.nome })) : (escolhidas?.obrigatorios ?? []),
            canais: [...canais],
          },
        }),
        { sucesso: "Escolhas salvas no rascunho", erro: "Não foi possível salvar as escolhas." },
      );
      if (r.ok) onMudou();
    });
  }

  function executar(acao: "criar" | "apagar") {
    setConfirmando(null);
    startTransition(async () => {
      if (acao === "criar") {
        await executarComToast(criarNaoListadoShopee({ rascunho_id: rascunho.id, confirmo: true }), { sucesso: "Criado na Shopee como não listado. Revise no Seller Centre e publique.", erro: "Não foi possível criar na Shopee." });
        // Relê o rascunho também quando falha: o servidor grava o id e o aviso do item que ficou listado.
        onMudou();
      } else {
        const r = await executarComToast(removerItemShopee({ rascunho_id: rascunho.id, confirmo: true }), { sucesso: "Item apagado da Shopee", erro: "Não foi possível apagar o item." });
        if (r.ok) onMudou();
      }
    });
  }

  const visiveis = (atributos ?? []).filter((a) => a.obrigatorio || mostrarOpcionais);
  const opcionais = (atributos ?? []).filter((a) => !a.obrigatorio).length;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Criar na Shopee (não listado)</CardTitle>
          <CardSubtitle>O anúncio vai para a sua loja escondido dos compradores. Você revisa no Seller Centre e publica quando quiser.</CardSubtitle>
        </div>
      </CardHeader>

      {item ? (
        <div className="space-y-3">
          <p className={`rounded-md border p-3 text-sm ${item.erro ? "border-negative text-negative" : "border-border bg-surface-2 text-text-primary"}`} role={item.erro ? "alert" : undefined}>
            {item.erro ? (
              <>
                <AlertTriangle size={14} className="inline mr-1" aria-hidden /> {item.erro}
              </>
            ) : (
              <>
                <Check size={14} className="inline mr-1 text-positive" aria-hidden /> Item <strong>{item.itemId}</strong> criado na Shopee com status <strong>{item.status === "UNLIST" ? "não listado" : item.status}</strong>. Abra o Seller Centre › Meus Produtos › Não listados para revisar e publicar.
              </>
            )}
          </p>
          <Button variant="ghost" onClick={() => setConfirmando("apagar")} disabled={pending}>
            <Trash2 size={14} aria-hidden /> Apagar da Shopee
          </Button>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <Button variant="secondary" onClick={testar} loading={pending && !sonda} disabled={pending}>
              <PlugZap size={14} aria-hidden /> Testar conexão (só leitura)
            </Button>
            <p className="text-xs text-text-tertiary mt-1.5">Pede à Shopee as categorias e os canais de frete da sua loja. Não cria nem altera nada. Se negar, o app da Shopee ainda não tem permissão de produto.</p>
          </div>

          {sonda && (
            <>
              <FormField label="Canais de frete que o anúncio vai usar *">
                <div className="flex flex-col gap-1.5">
                  {sonda.canais.length === 0 && <span className="text-sm text-text-secondary">Nenhum canal de frete habilitado na loja.</span>}
                  {sonda.canais.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm text-text-primary">
                      <input
                        type="checkbox"
                        checked={canais.has(c.id)}
                        onChange={(e) =>
                          setCanais((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(c.id);
                            else n.delete(c.id);
                            return n;
                          })
                        }
                      />
                      {c.nome}
                    </label>
                  ))}
                </div>
              </FormField>

              <div className="mb-4">
                <span className="block text-xs font-medium text-text-secondary mb-1.5">Categoria da Shopee *</span>
                {categoria && !opcoes && (
                  <p className="text-sm text-text-primary mb-2">
                    {categoria.nome}{" "}
                    <button type="button" className="ml-1 text-xs text-accent hover:underline" onClick={() => abrirNivel(0, [])}>
                      trocar
                    </button>
                  </p>
                )}
                {!categoria && !opcoes && (
                  <Button variant="secondary" onClick={() => abrirNivel(0, [])} disabled={pending}>
                    Escolher categoria
                  </Button>
                )}
                {opcoes && (
                  <div className="rounded-md border border-border p-2">
                    {pilha.length > 0 && (
                      <button type="button" onClick={voltar} className="mb-1 inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
                        <ArrowLeft size={12} aria-hidden /> Voltar ({pilha.map((p) => p.nome).join(" › ")})
                      </button>
                    )}
                    <ul className="max-h-56 overflow-y-auto">
                      {opcoes.map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => escolher(c)} disabled={pending} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm text-text-primary hover:bg-surface-2">
                            {c.nome}
                            {c.temFilhas && <ChevronRight size={14} className="text-text-tertiary" aria-hidden />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {atributos && atributos.length > 0 && (
                <div className="mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                    {visiveis.map((a) => (
                      <CampoAtributo key={a.id} a={a} valor={valores[a.id]} onChange={(v) => setValores((s) => ({ ...s, [a.id]: v }))} />
                    ))}
                  </div>
                  {opcionais > 0 && (
                    <button type="button" className="text-xs text-accent hover:underline" onClick={() => setMostrarOpcionais((m) => !m)}>
                      {mostrarOpcionais ? "Esconder os opcionais" : `Mostrar ${opcionais} atributo(s) opcional(is)`}
                    </button>
                  )}
                </div>
              )}

              <Button variant="secondary" onClick={salvarEscolhas} loading={pending} disabled={pending || !categoria || canais.size === 0}>
                Salvar escolhas
              </Button>
            </>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <h4 className="text-xs font-medium uppercase tracking-wide text-text-tertiary mb-2">Antes de criar</h4>
            {pendencias.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-text-primary">
                <Check size={14} className="text-positive" aria-hidden /> Tudo pronto para criar.
              </p>
            ) : (
              <ul className="space-y-1 text-sm text-text-secondary">
                {pendencias.map((p) => (
                  <li key={p} className="flex gap-1.5">
                    <Circle size={12} className="mt-1 shrink-0" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
            )}
            <Button className="mt-3" variant="primary" onClick={() => setConfirmando("criar")} disabled={pending || pendencias.length > 0}>
              <Send size={14} aria-hidden /> Criar na Shopee (não listado)
            </Button>
          </div>
        </>
      )}

      <Modal open={confirmando === "criar"} onClose={() => setConfirmando(null)} title="Criar o anúncio na Shopee?" width="max-w-lg">
        <div className="space-y-3 text-sm text-text-secondary">
          <p>
            Vou criar <strong className="text-text-primary">{rascunho.titulo}</strong> na sua loja da Shopee como <strong className="text-text-primary">não listado</strong>: ele não aparece para compradores.
          </p>
          <p>Em seguida confiro o status real do item. Se a Shopee o deixar à venda por engano, tiro do ar na hora e aviso. Você revisa em Seller Centre › Meus Produtos › Não listados e publica quando quiser.</p>
          <ul className="list-disc pl-5">
            <li>
              Preço enviado: <strong className="text-text-primary">{rascunho.preco.preco ? formatBRL(rascunho.preco.preco) : "—"}</strong>
              {rascunho.preco.origem === "loja" ? ` (de ${rascunho.preco.lojaRotulo}` : " (do cadastro"}
              {rascunho.preco.lucro !== null ? `, lucro de ${formatBRL(rascunho.preco.lucro)} por venda)` : ")"}.
            </li>
            <li>{capas.length} imagem(ns) será(ão) enviada(s) e a primeira é a capa.</li>
            <li>O estoque inicial é o do cadastro do produto.</li>
          </ul>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
            <Button variant="primary" className="flex-1" onClick={() => executar("criar")}>
              Criar não listado
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmando === "apagar"} onClose={() => setConfirmando(null)} title="Apagar o item da Shopee?" width="max-w-md">
        <div className="space-y-3 text-sm text-text-secondary">
          <p>O item {item?.itemId} será apagado da sua loja na Shopee. Isso não pode ser desfeito. O rascunho aqui no Painel continua.</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" className="flex-1" onClick={() => executar("apagar")}>
              Apagar da Shopee
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}
