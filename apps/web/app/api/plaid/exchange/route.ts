import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({
    message: 'Implement public_token exchange in Edge Function plaid-link-exchange.'
  })
}
