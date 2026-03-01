import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    gross_cash: 0,
    accrued_liabilities: 0,
    outstanding_credit_balances: 0,
    provisioned_obligations: 0,
    true_liquid_position: 0,
    as_of: new Date().toISOString()
  })
}
