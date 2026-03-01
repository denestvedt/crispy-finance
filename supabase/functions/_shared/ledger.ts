export const centsToDecimalString = (amountCents: bigint): string => {
  const sign = amountCents < 0n ? '-' : ''
  const absCents = amountCents < 0n ? -amountCents : amountCents
  const whole = absCents / 100n
  const cents = absCents % 100n
  return `${sign}${whole.toString()}.${cents.toString().padStart(2, '0')}`
}

export const decimalStringToCents = (value: string): bigint => {
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

export const sumCents = (amounts: bigint[]): bigint =>
  amounts.reduce((acc, amount) => acc + amount, 0n)
