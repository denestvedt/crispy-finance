export type LogContext = {
  function_name: string
  household_id?: string | null
  entry_id?: string | null
  event_id?: string | null
  correlation_id?: string | null
}

type LogLevel = 'INFO' | 'WARN' | 'ERROR'

const asOptionalString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : null
}

const contextFromPayload = (payload: Record<string, unknown>) => ({
  household_id: asOptionalString(payload.household_id),
  entry_id: asOptionalString(payload.entry_id ?? payload.journal_entry_id ?? payload.id),
  event_id: asOptionalString(payload.event_id ?? payload.webhook_event_id ?? payload.document_parse_id),
  correlation_id: asOptionalString(payload.correlation_id),
})

export const buildLogContext = (
  functionName: string,
  payload: Record<string, unknown> = {},
  req?: Request,
): LogContext => ({
  function_name: functionName,
  ...contextFromPayload(payload),
  correlation_id:
    asOptionalString(req?.headers.get('x-correlation-id')) ??
    contextFromPayload(payload).correlation_id ??
    crypto.randomUUID(),
})

export const createLogger = (baseContext: LogContext) => {
  const writeLog = (level: LogLevel, message: string, details: Record<string, unknown> = {}) => {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        message,
        ...baseContext,
        ...details,
      }),
    )
  }

  return {
    child: (context: Partial<LogContext>) =>
      createLogger({
        ...baseContext,
        ...context,
      }),
    info: (message: string, details?: Record<string, unknown>) => writeLog('INFO', message, details),
    warn: (message: string, details?: Record<string, unknown>) => writeLog('WARN', message, details),
    error: (message: string, details?: Record<string, unknown>) => writeLog('ERROR', message, details),
  }
}
