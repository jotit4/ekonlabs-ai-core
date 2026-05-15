// logger.ts — wrapper de logging JSON estructurado
// Output format: { level, msg, ...ctx, ts }
// Solo loggea en server-side (API Routes, Server Components)
// NO importar desde componentes 'use client'

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

interface LogContext {
  [key: string]: unknown
}

function log(level: LogLevel, msg: string, ctx?: LogContext): void {
  const entry = {
    level,
    msg,
    ...(ctx ?? {}),
    ts: new Date().toISOString(),
  }

  const consoleFn =
    level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.log

  consoleFn(JSON.stringify(entry))
}

export const logger = {
  info: (msg: string, ctx?: LogContext) => log('info', msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log('warn', msg, ctx),
  error: (msg: string, ctx?: LogContext) => log('error', msg, ctx),
  debug: (msg: string, ctx?: LogContext) => log('debug', msg, ctx),
}
