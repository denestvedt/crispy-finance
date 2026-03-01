'use client'

import type { TrueLiquidPosition } from '@household-cfo/types'

function moneyFromCents(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value / 100)
}

export function PositionTrendChart({ position }: { position: TrueLiquidPosition }) {
  const chartData = [
    { label: 'Gross cash', value: position.gross_cash },
    { label: 'Accrued liabilities', value: -Math.abs(position.accrued_liabilities) },
    { label: 'Credit balances', value: -Math.abs(position.outstanding_credit_balances) },
    { label: 'Provisions', value: -Math.abs(position.provisioned_obligations) },
    { label: 'True liquid', value: position.true_liquid_position },
  ]

  const maxAbs = Math.max(...chartData.map((item) => Math.abs(item.value)), 1)

  return (
    <div className="space-y-2">
      {chartData.map((item) => {
        const widthPercent = `${Math.round((Math.abs(item.value) / maxAbs) * 100)}%`
        const tone = item.value >= 0 ? 'bg-cyan-500' : 'bg-rose-500'

        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>{item.label}</span>
              <span>{moneyFromCents(item.value)}</span>
            </div>
            <div className="h-2 rounded bg-slate-800">
              <div className={`h-2 rounded ${tone}`} style={{ width: widthPercent }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
