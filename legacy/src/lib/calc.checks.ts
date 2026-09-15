import { CONFIGURACAO_PADRAO } from './shopeeFees'
import { DADOS_PADRAO } from '../store/defaults'
import {
  calcularEstrategiaCupom,
  calcularEstrategiaPromocao,
  calcularProduto,
  calcularRoas,
  montarResultado,
} from './calc'
import type { DadosProduto } from './types'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function produto(patch: Partial<DadosProduto> = {}): DadosProduto {
  return {
    ...DADOS_PADRAO,
    custoProdutoUnico: 20,
    custoEmbalagem: 2,
    modoCalculo: 'preco',
    precoVendaInformado: 79.99,
    ...patch,
  }
}

const cfg = CONFIGURACAO_PADRAO

{
  const baixo = montarResultado(79.99, produto(), cfg, true)
  const alto = montarResultado(80, produto(), cfg, true)
  assert(baixo.detalhamento.faixaAplicada.id === 'f1', '79,99 deve ser faixa f1')
  assert(alto.detalhamento.faixaAplicada.id === 'f2', '80 deve ser faixa f2')
  assert(baixo.detalhamento.taxaFixa === 4, 'taxa fixa f1')
  assert(alto.detalhamento.taxaFixa === 16, 'taxa fixa f2')
}

{
  const dados = produto({ precoVendaInformado: 7.5 })
  const r = montarResultado(7.5, dados, cfg, true)
  assert(r.detalhamento.abaixoDe8, 'regra < 8')
  assert(Math.abs(r.detalhamento.comissaoShopee - 7.5 * 0.5) < 0.001, 'comissão 50% abaixo de 8')
  assert(Math.abs(r.detalhamento.taxaFixa - 2) < 0.001, 'taxa fixa pela metade')
}

{
  const dados = produto({ participaCampanha: true, precoVendaInformado: 100 })
  const off = montarResultado(100, produto({ precoVendaInformado: 100, participaCampanha: false }), cfg, true)
  const on = montarResultado(100, dados, cfg, true)
  assert(on.detalhamento.taxaCampanha > 0, 'campanha gera taxa')
  assert(off.detalhamento.taxaCampanha === 0, 'sem campanha taxa zero')
  assert(on.lucroLiquido < off.lucroLiquido, 'campanha reduz lucro')
}

{
  const dados = produto({ precoVendaInformado: 79.9 })
  const cupom = calcularEstrategiaCupom(dados, cfg, 79.9, 0.2, 0.25, 40)
  assert(cupom.precoInflado > 79.9, 'infla cadastro')
  assert(cupom.mudouFaixa === (cupom.resultadoCadastro.detalhamento.faixaAplicada.id !== 'f1'), 'faixa do cadastro consistente')
  if (cupom.precoInflado >= 80) {
    assert(cupom.mudouFaixa, 'inflar acima de 80 deve mudar faixa')
    assert(cupom.resultadoCadastro.detalhamento.faixaAplicada.id === 'f2', 'cadastro na f2')
  }
}

{
  const dados = produto({ precoVendaInformado: 90 })
  const promo = calcularEstrategiaPromocao(dados, cfg, 90, 0.4, '2026-09-11T12:00:00.000Z', 7)
  assert(Math.abs(promo.precoInicialSugerido - 126) < 0.01, 'markup 40%')
  assert(promo.mudouFaixa, '90 vs 126 muda faixa')
  assert(promo.dataLiberacaoPromocao.startsWith('2026-09-18'), 'mais 7 dias')
}

{
  const r = calcularProduto(produto({ modoCalculo: 'margem', margemDesejadaPct: 0.3, precoVendaInformado: 0 }), cfg)
  assert(r.convergiu, 'margem 30% deve convergir')
  assert(Math.abs(r.margemLiquidaPct - 0.3) < 0.01, 'margem próxima de 30%')
}

{
  const ads = calcularRoas(100, 0.2, 0.1)
  assert(Math.abs(ads.roasBreakeven - 5) < 0.001, 'ROAS breakeven 5x')
  assert(Math.abs(ads.roasIdeal - 10) < 0.001, 'ROAS ideal 10x')
  assert(Math.abs(ads.gastoMaxPorPedidoBreakeven - 20) < 0.001, 'teto ads 20')
  assert(Math.abs(ads.gastoMaxPorPedidoIdeal - 10) < 0.001, 'teto ideal 10')
}

console.log('calc.checks: ok')
