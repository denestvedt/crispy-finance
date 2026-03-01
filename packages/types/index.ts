export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export type AccountSubtype =
  | 'cash_equivalent'
  | 'near_liquid'
  | 'illiquid'
  | 'current_liability'
  | 'accrued_liability'
  | 'long_term_liability'
  | 'mortgage'
  | 'retained_equity'
  | 'current_period_result'
  | 'income'
  | 'expense'

export type LiquidityTier = 'cash_equivalent' | 'near_liquid' | 'illiquid'

export type EntryType = 'transaction' | 'accrual' | 'close' | 'adjustment' | 'provision' | 'income_accrual'

export type EntrySource = 'plaid' | 'manual' | 'document_upload' | 'system_accrual' | 'period_close'

export type ObligationType = 'recurring' | 'irregular' | 'contingent'

export type ObligationFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual' | 'one_time'

export type PaySchedule = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

export type NotificationType =
  | 'low_liquid_position'
  | 'accrued_liability_threshold'
  | 'missed_obligation'
  | 'budget_review_reminder'
  | 'monthly_close_reminder'
  | 'income_statement_ready'
  | 'net_worth_milestone'
  | 'balance_sheet_snapshot'
  | 'large_transaction'
  | 'account_connection_error'
  | 'manual_entry_posted'

export interface Household {
  id: string
  name: string
  created_at: string
}

export interface HouseholdMember {
  id: string
  household_id: string
  user_id: string
  role: 'owner' | 'member'
  display_name: string
  pay_schedule: PaySchedule
  pay_day_1: number | null
  pay_day_2: number | null
  gross_annual_salary: number
  effective_daily_rate: number
  created_at: string
}

export interface Account {
  id: string
  household_id: string
  account_type: AccountType
  account_subtype: AccountSubtype
  liquidity_tier: LiquidityTier | null
  name: string
  external_account_id: string | null
  plaid_item_id: string | null
  is_system: boolean
  current_balance: number
  created_at: string
}

export interface JournalEntry {
  id: string
  household_id: string
  entry_date: string
  effective_date: string
  description: string
  entry_type: EntryType
  source: EntrySource
  is_posted: boolean
  created_by: string | null
  created_at: string
  lines?: JournalLine[]
}

export interface JournalLine {
  id: string
  journal_entry_id: string
  account_id: string
  amount: number
  side: 'debit' | 'credit'
  memo: string | null
}

export interface Obligation {
  id: string
  household_id: string
  name: string
  obligation_type: ObligationType
  frequency: ObligationFrequency
  estimated_amount: number
  probability: number
  next_due_date: string
  accrual_account_id: string
  expense_account_id: string
  is_active: boolean
  created_at: string
}

export interface TrueLiquidPosition {
  gross_cash: number
  accrued_liabilities: number
  outstanding_credit_balances: number
  provisioned_obligations: number
  true_liquid_position: number
  as_of: string
}

export interface BalanceSheet {
  assets: {
    cash_equivalents: Account[]
    near_liquid: Account[]
    illiquid: Account[]
    total_assets: number
  }
  liabilities: {
    current: Account[]
    accrued: Account[]
    long_term: Account[]
    mortgage: Account[]
    total_liabilities: number
  }
  equity: {
    retained: number
    current_period_result: number
    total_equity: number
  }
  as_of: string
}

export interface NotificationPayload {
  type: NotificationType
  household_id: string
  user_id: string
  title: string
  body: string
  data?: Record<string, unknown>
}

export interface ErrorEnvelope {
  code: string
  message: string
  retryable: boolean
  correlation_id: string
}

export type ApiResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      error: ErrorEnvelope
    }

export interface PostJournalEntryLineInput {
  account_id: string
  amount_cents: number
  side: 'debit' | 'credit'
  memo?: string
}

export interface PostJournalEntryRequest {
  household_id: string
  entry_date?: string
  effective_date?: string
  description: string
  entry_type: EntryType
  source: EntrySource
  lines: PostJournalEntryLineInput[]
  idempotency_key: string
}

export interface PostJournalEntryResponse {
  journal_entry_id: string
  replayed: boolean
  is_posted: boolean
}

export interface CalculatePositionRequest {
  household_id: string
  as_of?: string
}

export type CalculatePositionResponse = TrueLiquidPosition

export interface RunDailyAccrualsRequest {
  household_id?: string
  run_date?: string
  idempotency_key?: string
}

export interface RunDailyAccrualsResponse {
  posted_count: number
  posted_total_cents: number
}

export interface ClosePeriodRequest {
  household_id: string
  period_end: string
  idempotency_key: string
}

export interface ClosePeriodResponse {
  close_entry_id: string | null
  replayed: boolean
  net_income_cents: number
}

export interface PlaidExchangeRequest {
  household_id: string
  public_token: string
  plaid_transaction_ids: string[]
  idempotency_key: string
}

export interface PlaidExchangeResponse {
  accepted_transaction_ids: string[]
  duplicate_transaction_ids: string[]
}

export interface PlaidWebhookRequest {
  household_id: string
  webhook_event_id: string
  transaction_amounts_cents: number[]
  idempotency_key: string
}

export interface PlaidWebhookResponse {
  webhook_event_id: string
  net_amount_cents: number
  transaction_count: number
  replayed: boolean
}
