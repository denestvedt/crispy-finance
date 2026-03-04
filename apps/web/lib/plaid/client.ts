import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

function getPlaidEnv(): string {
  const env = process.env.PLAID_ENV ?? 'sandbox'
  if (env === 'production') return PlaidEnvironments.production
  if (env === 'development') return PlaidEnvironments.development
  return PlaidEnvironments.sandbox
}

let _client: PlaidApi | null = null

export function getPlaidClient(): PlaidApi {
  if (_client) return _client

  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET

  if (!clientId || !secret) {
    throw new Error('PLAID_CLIENT_ID and PLAID_SECRET must be set')
  }

  const config = new Configuration({
    basePath: getPlaidEnv(),
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })

  _client = new PlaidApi(config)
  return _client
}
