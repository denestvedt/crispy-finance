import { TrueLiquidPositionCard } from '@/components/position/TrueLiquidPositionCard'

const DEMO_POSITION = {
  gross_cash: 16420.11,
  accrued_liabilities: 1320.55,
  outstanding_credit_balances: 2450.0,
  provisioned_obligations: 2100.0,
  true_liquid_position: 10549.56,
  as_of: new Date().toISOString()
}

export default function DashboardPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <TrueLiquidPositionCard position={DEMO_POSITION} />
    </section>
  )
}
