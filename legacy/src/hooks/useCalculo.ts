import { useMemo } from 'react'
import { calcularProduto, margemMaximaViavel } from '../lib/calc'
import { useAppStore } from '../store/useAppStore'

export function useCalculo() {
  const dados = useAppStore((s) => s.dados)
  const config = useAppStore((s) => s.config)
  const resultado = useMemo(() => calcularProduto(dados, config), [dados, config])
  const margemTeto = useMemo(() => margemMaximaViavel(dados, config), [dados, config])
  return { dados, config, resultado, margemTeto }
}
