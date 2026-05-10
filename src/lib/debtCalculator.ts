/**
 * Debt Payoff Calculation Engine
 * Pure functions — no side effects, fully testable.
 * Used by both the UI and the AI context builder.
 */

export interface DebtAccount {
  id: string
  name: string
  balance: number        // current balance (positive number)
  interestRate: number   // APR as decimal e.g. 0.2149
  minimumPayment: number
  accountType: string
}

export interface PayoffMonth {
  month: number
  date: Date
  payment: number
  principal: number
  interest: number
  balance: number
  accountId: string
}

export interface AccountPayoffResult {
  accountId: string
  name: string
  payoffMonth: number
  payoffDate: Date
  totalInterest: number
  totalPaid: number
  schedule: PayoffMonth[]
}

export interface StrategyResult {
  strategy: 'avalanche' | 'snowball' | 'custom'
  accounts: AccountPayoffResult[]
  totalInterest: number
  totalMonths: number
  payoffDate: Date
  totalPaid: number
  monthlySummary: MonthlySummary[]
}

export interface MonthlySummary {
  month: number
  date: Date
  totalPayment: number
  totalPrincipal: number
  totalInterest: number
  remainingBalance: number
  accountsActive: number
}

// ── Core amortization for a single account ────────────────────
export function amortizeAccount(
  account: DebtAccount,
  monthlyPayment: number,
  startMonth: number = 0
): PayoffMonth[] {
  const schedule: PayoffMonth[] = []
  let balance = account.balance
  const monthlyRate = account.interestRate / 12
  const start = new Date()
  start.setDate(1)

  let month = startMonth
  while (balance > 0.01 && month < 600) {
    const interest = balance * monthlyRate
    const payment = Math.min(monthlyPayment, balance + interest)
    const principal = payment - interest
    balance = Math.max(0, balance - principal)

    const date = new Date(start)
    date.setMonth(date.getMonth() + month + 1)

    schedule.push({ month, date, payment, principal, interest, balance, accountId: account.id })
    month++
  }
  return schedule
}

// ── Minimum payment validator ─────────────────────────────────
export function calcMinPayment(balance: number, rate: number): number {
  // Standard: greater of $25 or 1% of balance + monthly interest
  const monthlyInterest = balance * (rate / 12)
  return Math.max(25, balance * 0.01 + monthlyInterest)
}

// ── Multi-account payoff engine ───────────────────────────────
function runStrategy(
  accounts: DebtAccount[],
  priority: DebtAccount[],
  extraMonthly: number
): StrategyResult {
  // Working state
  const balances = Object.fromEntries(accounts.map(a => [a.id, a.balance]))
  const interest = Object.fromEntries(accounts.map(a => [a.id, 0]))
  const paid = Object.fromEntries(accounts.map(a => [a.id, 0]))
  const payoffMonth = Object.fromEntries(accounts.map(a => [a.id, -1]))
  const schedules: Record<string, PayoffMonth[]> = Object.fromEntries(accounts.map(a => [a.id, []]))
  const monthlySummary: MonthlySummary[] = []

  const startDate = new Date()
  startDate.setDate(1)

  let month = 0
  const MAX_MONTHS = 600

  while (month < MAX_MONTHS) {
    const active = accounts.filter(a => balances[a.id] > 0.01)
    if (active.length === 0) break

    // Calculate min payments for all active accounts
    const payments: Record<string, number> = {}
    let minTotal = 0
    for (const a of active) {
      const min = Math.max(a.minimumPayment, calcMinPayment(balances[a.id], a.interestRate))
      payments[a.id] = Math.min(min, balances[a.id] * (1 + a.interestRate / 12))
      minTotal += payments[a.id]
    }

    // Apply extra payment to highest-priority active account
    let extra = extraMonthly
    for (const a of priority) {
      if (balances[a.id] > 0.01 && extra > 0) {
        payments[a.id] = (payments[a.id] || 0) + extra
        extra = 0
        break
      }
    }

    // Process each account
    let monthTotalPayment = 0
    let monthTotalPrincipal = 0
    let monthTotalInterest = 0
    let monthRemainingBalance = 0

    for (const a of active) {
      const monthlyRate = a.interestRate / 12
      const interestCharge = balances[a.id] * monthlyRate
      const payment = Math.min(payments[a.id] || 0, balances[a.id] + interestCharge)
      const principal = payment - interestCharge
      balances[a.id] = Math.max(0, balances[a.id] - principal)

      interest[a.id] += interestCharge
      paid[a.id] += payment

      const date = new Date(startDate)
      date.setMonth(date.getMonth() + month + 1)

      schedules[a.id].push({
        month,
        date,
        payment,
        principal,
        interest: interestCharge,
        balance: balances[a.id],
        accountId: a.id,
      })

      if (balances[a.id] <= 0.01 && payoffMonth[a.id] === -1) {
        payoffMonth[a.id] = month
      }

      monthTotalPayment += payment
      monthTotalPrincipal += principal
      monthTotalInterest += interestCharge
      monthRemainingBalance += balances[a.id]
    }

    const summaryDate = new Date(startDate)
    summaryDate.setMonth(summaryDate.getMonth() + month + 1)

    monthlySummary.push({
      month,
      date: summaryDate,
      totalPayment: monthTotalPayment,
      totalPrincipal: monthTotalPrincipal,
      totalInterest: monthTotalInterest,
      remainingBalance: monthRemainingBalance,
      accountsActive: active.length,
    })

    month++
  }

  // Build per-account results
  const accountResults: AccountPayoffResult[] = accounts.map(a => {
    const pm = payoffMonth[a.id]
    const payoffDate = new Date(startDate)
    payoffDate.setMonth(payoffDate.getMonth() + pm + 1)
    return {
      accountId: a.id,
      name: a.name,
      payoffMonth: pm,
      payoffDate,
      totalInterest: Math.round(interest[a.id] * 100) / 100,
      totalPaid: Math.round(paid[a.id] * 100) / 100,
      schedule: schedules[a.id],
    }
  })

  const totalInterest = accountResults.reduce((s, r) => s + r.totalInterest, 0)
  const totalPaid = accountResults.reduce((s, r) => s + r.totalPaid, 0)
  const totalMonths = Math.max(...accountResults.map(r => r.payoffMonth)) + 1
  const payoffDate = new Date(startDate)
  payoffDate.setMonth(payoffDate.getMonth() + totalMonths)

  return {
    strategy: 'avalanche',
    accounts: accountResults,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalMonths,
    payoffDate,
    totalPaid: Math.round(totalPaid * 100) / 100,
    monthlySummary,
  }
}

// ── Avalanche: highest APR first ──────────────────────────────
export function calcAvalanche(
  accounts: DebtAccount[],
  extraMonthly: number = 0
): StrategyResult {
  const priority = [...accounts].sort((a, b) => b.interestRate - a.interestRate)
  const result = runStrategy(accounts, priority, extraMonthly)
  return { ...result, strategy: 'avalanche' }
}

// ── Snowball: smallest balance first ──────────────────────────
export function calcSnowball(
  accounts: DebtAccount[],
  extraMonthly: number = 0
): StrategyResult {
  const priority = [...accounts].sort((a, b) => a.balance - b.balance)
  const result = runStrategy(accounts, priority, extraMonthly)
  return { ...result, strategy: 'snowball' }
}

// ── Custom: user-defined order ────────────────────────────────
export function calcCustom(
  accounts: DebtAccount[],
  orderedIds: string[],
  extraMonthly: number = 0
): StrategyResult {
  const idIndex = Object.fromEntries(orderedIds.map((id, i) => [id, i]))
  const priority = [...accounts].sort((a, b) =>
    (idIndex[a.id] ?? 999) - (idIndex[b.id] ?? 999)
  )
  const result = runStrategy(accounts, priority, extraMonthly)
  return { ...result, strategy: 'custom' }
}

// ── Extra payment impact ───────────────────────────────────────
export function calcExtraPaymentImpact(
  accounts: DebtAccount[],
  strategy: 'avalanche' | 'snowball',
  baseExtra: number,
  newExtra: number
): {
  interestSaved: number
  monthsSaved: number
  baseResult: StrategyResult
  newResult: StrategyResult
} {
  const calc = strategy === 'avalanche' ? calcAvalanche : calcSnowball
  const baseResult = calc(accounts, baseExtra)
  const newResult = calc(accounts, newExtra)
  return {
    interestSaved: Math.round((baseResult.totalInterest - newResult.totalInterest) * 100) / 100,
    monthsSaved: baseResult.totalMonths - newResult.totalMonths,
    baseResult,
    newResult,
  }
}

// ── Retirement loan amortization ──────────────────────────────
export interface LoanPayment {
  paymentNumber: number
  dueDate: Date
  paymentAmount: number
  principalAmount: number
  interestAmount: number
  balanceAfter: number
}

export function generateLoanSchedule(
  principal: number,
  annualRate: number,
  termMonths: number,
  startDate: Date,
  frequency: 'monthly' | 'biweekly' = 'monthly'
): LoanPayment[] {
  if (!Number.isFinite(principal) || principal <= 0 || !Number.isFinite(termMonths) || termMonths <= 0) {
    return []
  }

  const isBiweekly = frequency === 'biweekly'
  // For biweekly: use 26 periods/year
  const periodsPerYear = isBiweekly ? 26 : 12
  const periodRate = annualRate / periodsPerYear
  const totalPayments = isBiweekly ? Math.round(termMonths * 26 / 12) : termMonths
  if (totalPayments <= 0) return []

  // Fixed payment using annuity formula
  const payment = periodRate === 0
    ? principal / totalPayments
    : principal * (periodRate * Math.pow(1 + periodRate, totalPayments))
      / (Math.pow(1 + periodRate, totalPayments) - 1)

  const schedule: LoanPayment[] = []
  let balance = principal
  const current = new Date(startDate)

  for (let i = 1; i <= totalPayments && balance > 0.01; i++) {
    const interest = balance * periodRate
    const principalPmt = Math.min(payment - interest, balance)
    balance = Math.max(0, balance - principalPmt)

    schedule.push({
      paymentNumber: i,
      dueDate: new Date(current),
      paymentAmount: Math.round((principalPmt + interest) * 100) / 100,
      principalAmount: Math.round(principalPmt * 100) / 100,
      interestAmount: Math.round(interest * 100) / 100,
      balanceAfter: Math.round(balance * 100) / 100,
    })

    // Advance date
    if (isBiweekly) {
      current.setDate(current.getDate() + 14)
    } else {
      current.setMonth(current.getMonth() + 1)
    }
  }

  return schedule
}

// ── Opportunity cost calculator ───────────────────────────────
export function calcOpportunityCost(
  loanAmount: number,
  loanTermMonths: number,
  assumedGrowthRate: number = 0.07
): number {
  // What the loanAmount would grow to if left invested
  const years = loanTermMonths / 12
  return Math.round(loanAmount * Math.pow(1 + assumedGrowthRate, years) * 100) / 100
}

// ── Build AI context (safe — no account numbers) ──────────────
export function buildDebtContext(
  accounts: DebtAccount[],
  avalanche: StrategyResult,
  snowball: StrategyResult,
  extraMonthly: number
): string {
  const lines = [
    `DEBT PROFILE SUMMARY (as of ${new Date().toLocaleDateString()})`,
    '',
    `Total Debt: $${accounts.reduce((s, a) => s + a.balance, 0).toLocaleString()}`,
    `Number of Accounts: ${accounts.length}`,
    `Extra Monthly Payment: $${extraMonthly}`,
    '',
    'ACCOUNTS:',
    ...accounts.map(a =>
      `- ${a.name}: $${a.balance.toLocaleString()} @ ${(a.interestRate * 100).toFixed(2)}% APR, min payment $${a.minimumPayment}/mo`
    ),
    '',
    'AVALANCHE STRATEGY (highest APR first):',
    `  Payoff date: ${avalanche.payoffDate.toLocaleDateString()}`,
    `  Total interest: $${avalanche.totalInterest.toLocaleString()}`,
    `  Total months: ${avalanche.totalMonths}`,
    '',
    'SNOWBALL STRATEGY (smallest balance first):',
    `  Payoff date: ${snowball.payoffDate.toLocaleDateString()}`,
    `  Total interest: $${snowball.totalInterest.toLocaleString()}`,
    `  Total months: ${snowball.totalMonths}`,
    '',
    `INTEREST DIFFERENCE (avalanche saves vs snowball): $${(snowball.totalInterest - avalanche.totalInterest).toLocaleString()}`,
  ]
  return lines.join('\n')
}
