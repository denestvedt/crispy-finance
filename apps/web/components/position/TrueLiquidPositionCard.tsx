import type { TrueLiquidPosition } from '@household-cfo/types'

function money(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function TrueLiquidPositionCard({ position }: { position: TrueLiquidPosition }) {
  const tone = position.true_liquid_position >= 0 ? 'text-finance-positive' : 'text-finance-negative'

  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs uppercase text-slate-400">True liquid position</p>
      <p className={`financial-number mt-2 text-3xl font-semibold ${tone}`}>{money(position.true_liquid_position)}</p>
      <p className="mt-1 text-xs text-slate-500">As of {new Date(position.as_of).toLocaleString()}</p>
    </article>
  )
}
