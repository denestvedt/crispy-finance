/**
 * Accounting correctness tests
 *
 * Tests the pure functions that underpin double-entry bookkeeping,
 * the journal balance invariant, and Plaid transaction mapping.
 */

import { describe, expect, it } from 'vitest'

// ── Ledger helpers (re-implement here to avoid Deno-module issues) ──────────

function centsToDecimalString(amountCents: bigint): string {
  const sign = amountCents < 0n ? '-' : ''
  const absCents = amountCents < 0n ? -amountCents : amountCents
  const whole = absCents / 100n
  const cents = absCents % 100n
  return `${sign}${whole.toString()}.${cents.toString().padStart(2, '0')}`
}

function decimalStringToCents(value: string): bigint {
  const normalized = value.trim()
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`Invalid decimal amount: ${value}`)
  }
  const [wholePart, fractionalPart = ''] = normalized.split('.')
  const sign = wholePart.startsWith('-') ? -1n : 1n
  const whole = BigInt(wholePart)
  const fraction = BigInt(fractionalPart.padEnd(2, '0'))
  return whole * 100n + sign * fraction
}

// ── Journal line builder (mirrors plaid-webhook-worker logic) ───────────────

type JournalLine = { account_id: string; amount: string; side: 'debit' | 'credit' }

function buildJournalLines(
  amount: number,
  linkedAccountId: string,
  expenseAccountId: string,
  incomeAccountId: string,
): JournalLine[] {
  const amountStr = Math.abs(amount).toFixed(2)
  if (amount > 0) {
    return [
      { account_id: expenseAccountId, amount: amountStr, side: 'debit' },
      { account_id: linkedAccountId, amount: amountStr, side: 'credit' },
    ]
  } else {
    return [
      { account_id: linkedAccountId, amount: amountStr, side: 'debit' },
      { account_id: incomeAccountId, amount: amountStr, side: 'credit' },
    ]
  }
}

/** Assert that the lines of a journal entry balance (debits = credits). */
function assertBalanced(lines: JournalLine[]): void {
  let debits = 0n
  let credits = 0n
  for (const line of lines) {
    const cents = decimalStringToCents(line.amount)
    if (line.side === 'debit') debits += cents
    else credits += cents
  }
  if (debits !== credits) {
    throw new Error(`Unbalanced entry: debits=${centsToDecimalString(debits)} credits=${centsToDecimalString(credits)}`)
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('decimalStringToCents', () => {
  it('converts whole dollar amounts', () => {
    expect(decimalStringToCents('100.00')).toBe(10000n)
  })

  it('converts fractional amounts', () => {
    expect(decimalStringToCents('9.99')).toBe(999n)
  })

  it('converts single-decimal amounts', () => {
    expect(decimalStringToCents('5.5')).toBe(550n)
  })

  it('converts negative amounts', () => {
    expect(decimalStringToCents('-25.00')).toBe(-2500n)
  })

  it('converts zero', () => {
    expect(decimalStringToCents('0.00')).toBe(0n)
  })

  it('throws on invalid input', () => {
    expect(() => decimalStringToCents('abc')).toThrow()
    expect(() => decimalStringToCents('1.234')).toThrow()
  })
})

describe('centsToDecimalString', () => {
  it('formats positive cents', () => {
    expect(centsToDecimalString(10000n)).toBe('100.00')
  })

  it('formats sub-dollar cents', () => {
    expect(centsToDecimalString(99n)).toBe('0.99')
  })

  it('formats negative cents', () => {
    expect(centsToDecimalString(-2500n)).toBe('-25.00')
  })

  it('formats zero', () => {
    expect(centsToDecimalString(0n)).toBe('0.00')
  })

  it('is the inverse of decimalStringToCents', () => {
    const cases = ['100.00', '9.99', '0.01', '1234.56', '-50.00']
    for (const c of cases) {
      expect(centsToDecimalString(decimalStringToCents(c))).toBe(c)
    }
  })
})

describe('buildJournalLines — balance invariant', () => {
  const LINKED = 'acct-cash-001'
  const EXPENSE = 'acct-exp-001'
  const INCOME = 'acct-inc-001'

  it('balances a positive (outflow) transaction', () => {
    const lines = buildJournalLines(49.99, LINKED, EXPENSE, INCOME)
    expect(lines).toHaveLength(2)
    assertBalanced(lines)
  })

  it('balances a negative (inflow) transaction', () => {
    const lines = buildJournalLines(-1500.00, LINKED, EXPENSE, INCOME)
    assertBalanced(lines)
  })

  it('routes a purchase to debit-expense, credit-linked', () => {
    const lines = buildJournalLines(100.00, LINKED, EXPENSE, INCOME)
    const debit = lines.find((l) => l.side === 'debit')
    const credit = lines.find((l) => l.side === 'credit')
    expect(debit?.account_id).toBe(EXPENSE)
    expect(credit?.account_id).toBe(LINKED)
  })

  it('routes an inflow to debit-linked, credit-income', () => {
    const lines = buildJournalLines(-2500.00, LINKED, EXPENSE, INCOME)
    const debit = lines.find((l) => l.side === 'debit')
    const credit = lines.find((l) => l.side === 'credit')
    expect(debit?.account_id).toBe(LINKED)
    expect(credit?.account_id).toBe(INCOME)
  })

  it('handles fractional cent rounding', () => {
    // 0.001 rounds to 0.00, but let's test a real fractional Plaid amount
    const lines = buildJournalLines(12.34, LINKED, EXPENSE, INCOME)
    assertBalanced(lines)
    expect(lines[0].amount).toBe('12.34')
  })
})

describe('journal balance check simulation', () => {
  it('throws when debits ≠ credits', () => {
    const unbalanced: JournalLine[] = [
      { account_id: 'a', amount: '100.00', side: 'debit' },
      { account_id: 'b', amount: '99.00', side: 'credit' }, // intentionally wrong
    ]
    expect(() => assertBalanced(unbalanced)).toThrow(/Unbalanced entry/)
  })

  it('passes for a manually balanced entry', () => {
    const balanced: JournalLine[] = [
      { account_id: 'cash', amount: '500.00', side: 'debit' },
      { account_id: 'income', amount: '500.00', side: 'credit' },
    ]
    expect(() => assertBalanced(balanced)).not.toThrow()
  })

  it('passes for a multi-line balanced entry', () => {
    // Split expense: $300 total = $200 groceries + $100 dining
    const multiLine: JournalLine[] = [
      { account_id: 'exp-groceries', amount: '200.00', side: 'debit' },
      { account_id: 'exp-dining', amount: '100.00', side: 'debit' },
      { account_id: 'cash', amount: '300.00', side: 'credit' },
    ]
    expect(() => assertBalanced(multiLine)).not.toThrow()
  })
})

describe('accrual math', () => {
  /**
   * Daily accrual = estimated_amount / days_in_period * probability
   * This mirrors the logic in run-daily-accruals.
   */
  function dailyAccrual(estimatedAmount: number, daysInPeriod: number, probability: number): number {
    return estimatedAmount / daysInPeriod * probability
  }

  it('computes monthly accrual at full probability', () => {
    const result = dailyAccrual(3000, 30, 1.0)
    expect(result).toBeCloseTo(100.0, 4)
  })

  it('computes monthly accrual at 50% probability (contingent)', () => {
    const result = dailyAccrual(1200, 30, 0.5)
    expect(result).toBeCloseTo(20.0, 4)
  })

  it('produces a balanced entry for a daily accrual', () => {
    const daily = dailyAccrual(1200, 30, 1.0)
    const amountStr = daily.toFixed(2)
    const lines: JournalLine[] = [
      { account_id: 'exp', amount: amountStr, side: 'debit' },
      { account_id: 'accrued-liability', amount: amountStr, side: 'credit' },
    ]
    assertBalanced(lines)
  })

  it('annual salary daily rate for biweekly pay schedule', () => {
    const grossAnnual = 120_000
    const effectiveDaily = grossAnnual / 365
    expect(effectiveDaily).toBeCloseTo(328.767, 2)
  })
})

describe('true liquid position calculation', () => {
  function calculateTrueLiquidPosition(
    grossCash: number,
    accruedLiabilities: number,
    outstandingCredit: number,
    provisionedObligations: number,
  ) {
    return grossCash - accruedLiabilities - outstandingCredit - provisionedObligations
  }

  it('returns full gross cash when no liabilities', () => {
    expect(calculateTrueLiquidPosition(10_000, 0, 0, 0)).toBe(10_000)
  })

  it('deducts accrued liabilities', () => {
    expect(calculateTrueLiquidPosition(10_000, 2_000, 0, 0)).toBe(8_000)
  })

  it('deducts outstanding credit balances', () => {
    expect(calculateTrueLiquidPosition(10_000, 0, 3_000, 0)).toBe(7_000)
  })

  it('deducts provisioned obligations', () => {
    expect(calculateTrueLiquidPosition(10_000, 0, 0, 1_500)).toBe(8_500)
  })

  it('can yield a negative position', () => {
    expect(calculateTrueLiquidPosition(5_000, 3_000, 2_000, 1_000)).toBe(-1_000)
  })

  it('handles zero gross cash', () => {
    expect(calculateTrueLiquidPosition(0, 0, 0, 0)).toBe(0)
  })
})
