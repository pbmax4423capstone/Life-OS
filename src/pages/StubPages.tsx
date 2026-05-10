import { FormEvent, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart3,
  CalendarClock,
  CreditCard,
  Edit,
  Landmark,
  PiggyBank,
  Plus,
  Pause,
  Play,
  Trash2,
  Trophy,
  Wallet,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import {
  EmptyState,
  FinanceModal,
  SimpleBarChart,
  SimpleLineChart,
  SkeletonList,
  ToastViewport,
  formatCurrency,
  formatDateLabel,
  useToastQueue,
} from '@/components/finance/FinanceUi'

type AccountType = 'checking' | 'savings' | 'credit_card' | 'loan' | 'investment' | 'retirement' | 'other'
type PaymentFrequency = 'one_time' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'annual'
type PaymentStatus = 'active' | 'paused' | 'cancelled'
type ProgramType = 'points' | 'miles' | 'cashback'

interface AccountRow {
  id: string
  owner_id: string
  account_type: AccountType
  institution_name: string
  nickname: string | null
  current_balance: number
  credit_limit: number | null
  interest_rate: number | null
  color: string
  currency: string | null
  deleted_at: string | null
}

interface TransactionRow {
  id: string
  account_id: string
  owner_id: string
  amount: number
  category: string | null
  description: string | null
  transaction_date: string
}

interface ScheduledPaymentRow {
  id: string
  owner_id: string
  from_account_id: string
  to_account_id: string | null
  payee_name: string | null
  amount: number
  frequency: PaymentFrequency
  next_due_date: string
  end_date: string | null
  status: PaymentStatus
  memo: string | null
  anchor_date: string | null
  deleted_at: string | null
}

interface PaymentHistoryRow {
  id: string
  scheduled_payment_id: string
  amount: number
  paid_date: string
  status: string
}

interface AccountSnapshotRow {
  id: string
  account_id: string
  balance: number
  snapshot_date: string
}

interface LoyaltyProgramRow {
  id: string
  owner_id: string
  program_name: string
  program_type: ProgramType
  account_number: string | null
  points_balance: number
  value_per_point: number
  tier_status: string | null
  expiration_date: string | null
  deleted_at: string | null
}

interface LoyaltyTransactionRow {
  id: string
  program_id: string
  transaction_type: string
  points_amount: number
  cash_value: number | null
  description: string | null
  transaction_date: string
}

interface AccountFormState {
  account_type: AccountType
  institution_name: string
  nickname: string
  current_balance: string
  credit_limit: string
  interest_rate: string
  currency: string
  color: string
}

interface PaymentFormState {
  payee_name: string
  amount: string
  source_account_id: string
  destination_account: string
  frequency: PaymentFrequency
  start_date: string
  end_date: string
  notes: string
  biweekly_day: string
}

interface ProgramFormState {
  program_name: string
  program_type: ProgramType
  account_number: string
  points_balance: string
  value_per_point: string
  tier_status: string
  expiration_date: string
}

const ACCOUNT_TYPE_OPTIONS: AccountType[] = [
  'checking',
  'savings',
  'credit_card',
  'loan',
  'investment',
  'retirement',
  'other',
]

const ACCOUNT_GROUPS: Array<{ label: string; match: AccountType[]; icon: React.ElementType }> = [
  { label: 'Credit Cards', match: ['credit_card'], icon: CreditCard },
  { label: 'Bank Accounts', match: ['checking', 'savings'], icon: Landmark },
  { label: 'Loans', match: ['loan'], icon: Wallet },
  { label: 'Investments', match: ['investment', 'retirement'], icon: PiggyBank },
  { label: 'Other', match: ['other'], icon: BarChart3 },
]

const FREQUENCY_OPTIONS: PaymentFrequency[] = ['one_time', 'weekly', 'biweekly', 'monthly', 'quarterly', 'annual']

const defaultAccountForm = (): AccountFormState => ({
  account_type: 'checking',
  institution_name: '',
  nickname: '',
  current_balance: '',
  credit_limit: '',
  interest_rate: '',
  currency: 'USD',
  color: '#10B981',
})

const defaultPaymentForm = (): PaymentFormState => ({
  payee_name: '',
  amount: '',
  source_account_id: '',
  destination_account: '',
  frequency: 'monthly',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  notes: '',
  biweekly_day: '1',
})

const defaultProgramForm = (): ProgramFormState => ({
  program_name: '',
  program_type: 'points',
  account_number: '',
  points_balance: '',
  value_per_point: '',
  tier_status: '',
  expiration_date: '',
})

const toNumber = (value: string): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const startOfToday = (): Date => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

const ytdStartDate = (): Date => new Date(new Date().getFullYear(), 0, 1)

const maskAccountNumber = (value: string | null): string => {
  if (!value) return '••••'
  const suffix = value.slice(-4)
  return `•••• ${suffix}`
}

const normalizeRate = (rate: number | null): number => {
  if (rate === null) return 0
  return rate <= 1 ? rate * 100 : rate
}

function AccountForm({
  form,
  setForm,
  onSubmit,
  submitting,
  submitLabel,
}: {
  form: AccountFormState
  setForm: (updater: (current: AccountFormState) => AccountFormState) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  submitting: boolean
  submitLabel: string
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm text-slate-300">
          Account Type
          <select
            className="input-base mt-1"
            value={form.account_type}
            onChange={(event) => setForm((current) => ({ ...current, account_type: event.target.value as AccountType }))}
          >
            {ACCOUNT_TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>{type.replace('_', ' ')}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-300">
          Institution Name
          <input
            className="input-base mt-1"
            value={form.institution_name}
            onChange={(event) => setForm((current) => ({ ...current, institution_name: event.target.value }))}
            required
          />
        </label>

        <label className="text-sm text-slate-300">
          Nickname
          <input
            className="input-base mt-1"
            value={form.nickname}
            onChange={(event) => setForm((current) => ({ ...current, nickname: event.target.value }))}
          />
        </label>

        <label className="text-sm text-slate-300">
          Current Balance
          <input
            className="input-base mt-1"
            value={form.current_balance}
            onChange={(event) => setForm((current) => ({ ...current, current_balance: event.target.value }))}
            inputMode="decimal"
            required
          />
        </label>

        <label className="text-sm text-slate-300">
          Credit Limit
          <input
            className="input-base mt-1"
            value={form.credit_limit}
            onChange={(event) => setForm((current) => ({ ...current, credit_limit: event.target.value }))}
            inputMode="decimal"
          />
        </label>

        <label className="text-sm text-slate-300">
          Interest Rate (%)
          <input
            className="input-base mt-1"
            value={form.interest_rate}
            onChange={(event) => setForm((current) => ({ ...current, interest_rate: event.target.value }))}
            inputMode="decimal"
          />
        </label>

        <label className="text-sm text-slate-300">
          Currency
          <input
            className="input-base mt-1"
            value={form.currency}
            onChange={(event) => setForm((current) => ({ ...current, currency: event.target.value.toUpperCase() }))}
            required
          />
        </label>

        <label className="text-sm text-slate-300">
          Color
          <div className="flex items-center gap-2 mt-1">
            <input
              type="color"
              className="h-10 w-12 bg-transparent"
              value={form.color}
              onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
            />
            <span className="text-xs text-slate-500">{form.color}</span>
          </div>
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

export function AccountsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const toast = useToastQueue()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<AccountRow | null>(null)
  const [form, setForm] = useState<AccountFormState>(defaultAccountForm)

  const accountsQuery = useQuery({
    queryKey: ['finance-accounts', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<AccountRow[]> => {
      if (!user) return []
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .eq('owner_id', user.id)
        .is('deleted_at', null)
        .order('institution_name', { ascending: true })

      if (error) throw error
      return (data ?? []) as AccountRow[]
    },
  })

  const transactionsQuery = useQuery({
    queryKey: ['finance-account-fees', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<TransactionRow[]> => {
      if (!user) return []
      const { data, error } = await supabase
        .from('transactions')
        .select('id, account_id, owner_id, amount, category, description, transaction_date')
        .eq('owner_id', user.id)
        .is('deleted_at', null)

      if (error) throw error
      return (data ?? []) as TransactionRow[]
    },
  })

  const feeStats = useMemo(() => {
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const ytdStart = ytdStartDate()

    const stats = new Map<string, { monthlyFees: number; serviceCharges: number; ytdTotal: number }>()

    for (const row of transactionsQuery.data ?? []) {
      const category = (row.category ?? '').toLowerCase()
      const description = (row.description ?? '').toLowerCase()
      const amount = Math.abs(row.amount)
      const txDate = new Date(row.transaction_date)
      const isFee = category.includes('fee') || description.includes('fee')
      const isService = category.includes('service') || description.includes('service charge')

      if (!isFee && !isService) continue

      const current = stats.get(row.account_id) ?? { monthlyFees: 0, serviceCharges: 0, ytdTotal: 0 }

      if (txDate >= monthStart) {
        current.monthlyFees += amount
      }
      if (isService) {
        current.serviceCharges += amount
      }
      if (txDate >= ytdStart) {
        current.ytdTotal += amount
      }
      stats.set(row.account_id, current)
    }

    return stats
  }, [transactionsQuery.data])

  const groupedAccounts = useMemo(() => {
    const map = new Map<string, AccountRow[]>()
    for (const group of ACCOUNT_GROUPS) {
      map.set(group.label, (accountsQuery.data ?? []).filter((account) => group.match.includes(account.account_type)))
    }
    return map
  }, [accountsQuery.data])

  const upsertAccountMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be signed in')
      if (!form.institution_name.trim() || form.current_balance.trim() === '') {
        throw new Error('Account type, institution name, and current balance are required')
      }

      const payload = {
        owner_id: user.id,
        account_type: form.account_type,
        institution_name: form.institution_name.trim(),
        nickname: form.nickname.trim() || null,
        current_balance: toNumber(form.current_balance),
        credit_limit: form.credit_limit.trim() ? toNumber(form.credit_limit) : null,
        interest_rate: form.interest_rate.trim() ? toNumber(form.interest_rate) : null,
        currency: form.currency.trim() || 'USD',
        color: form.color,
      }

      if (editingAccount) {
        const { error } = await supabase
          .from('financial_accounts')
          .update(payload)
          .eq('id', editingAccount.id)
          .eq('owner_id', user.id)

        if (error) throw error
        return 'updated'
      }

      const { error } = await supabase.from('financial_accounts').insert(payload)
      if (error) throw error
      return 'created'
    },
    onSuccess: (mode) => {
      toast.success(mode === 'created' ? 'Account added successfully' : 'Account updated successfully')
      setModalOpen(false)
      setEditingAccount(null)
      setForm(defaultAccountForm())
      void queryClient.invalidateQueries({ queryKey: ['finance-accounts', user?.id] })
      void queryClient.invalidateQueries({ queryKey: ['finance-account-fees', user?.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Unable to save account')
    },
  })

  const deleteAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      if (!user) throw new Error('You must be signed in')
      const { error } = await supabase
        .from('financial_accounts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', accountId)
        .eq('owner_id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Account deleted')
      void queryClient.invalidateQueries({ queryKey: ['finance-accounts', user?.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Unable to delete account')
    },
  })

  const openCreate = () => {
    setEditingAccount(null)
    setForm(defaultAccountForm())
    setModalOpen(true)
  }

  const openEdit = (account: AccountRow) => {
    setEditingAccount(account)
    setForm({
      account_type: account.account_type,
      institution_name: account.institution_name,
      nickname: account.nickname ?? '',
      current_balance: String(account.current_balance),
      credit_limit: account.credit_limit === null ? '' : String(account.credit_limit),
      interest_rate: account.interest_rate === null ? '' : String(normalizeRate(account.interest_rate)),
      currency: account.currency ?? 'USD',
      color: account.color || '#10B981',
    })
    setModalOpen(true)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <ToastViewport toasts={toast.toasts} onDismiss={toast.dismiss} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Accounts</h1>
          <p className="text-sm text-slate-400 mt-1">Manage your financial accounts, utilization, and fee performance.</p>
        </div>
        <button type="button" onClick={openCreate} className="btn-primary">
          <Plus size={15} /> Add Account
        </button>
      </div>

      {(accountsQuery.isLoading || transactionsQuery.isLoading) && <SkeletonList rows={5} />}

      {(accountsQuery.isError || transactionsQuery.isError) ? (
        <EmptyState
          title="Unable to load accounts"
          description="Please refresh and try again."
        />
      ) : null}

      {!accountsQuery.isLoading && !accountsQuery.isError && (accountsQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="No accounts yet"
          description="Add your first account to start tracking balances, utilization, and fees."
          cta={<button type="button" onClick={openCreate} className="btn-primary"><Plus size={14} /> Add Account</button>}
        />
      ) : null}

      {!accountsQuery.isLoading && !accountsQuery.isError && (accountsQuery.data ?? []).length > 0 ? (
        <div className="space-y-5">
          {ACCOUNT_GROUPS.map(({ label, icon: Icon }) => {
            const items = groupedAccounts.get(label) ?? []
            if (items.length === 0) return null
            return (
              <section key={label} className="space-y-3">
                <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-2">
                  <Icon size={14} /> {label}
                </h2>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {items.map((account) => {
                    const utilization = account.credit_limit && account.credit_limit > 0
                      ? Math.min((Math.abs(account.current_balance) / account.credit_limit) * 100, 100)
                      : null
                    const stats = feeStats.get(account.id) ?? { monthlyFees: 0, serviceCharges: 0, ytdTotal: 0 }

                    return (
                      <article key={account.id} className="card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-2.5 h-12 rounded-full" style={{ backgroundColor: account.color || '#10B981' }} />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-100 truncate">{account.nickname || account.institution_name}</p>
                              <p className="text-xs text-slate-500 truncate">{account.institution_name}</p>
                              <p className="text-xs text-slate-400 mt-1">Type: {account.account_type.replace('_', ' ')}</p>
                            </div>
                          </div>

                          <div className="flex gap-1">
                            <button type="button" className="btn-ghost p-2" onClick={() => openEdit(account)} aria-label="Edit account">
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn-danger p-2"
                              aria-label="Delete account"
                              onClick={() => deleteAccountMutation.mutate(account.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
                          <div>
                            <p className="text-slate-500">Current Balance</p>
                            <p className="text-slate-100 font-semibold">{formatCurrency(account.current_balance)}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Credit Limit</p>
                            <p className="text-slate-200">{account.credit_limit ? formatCurrency(account.credit_limit) : '—'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Interest Rate</p>
                            <p className="text-slate-200">{account.interest_rate !== null ? `${normalizeRate(account.interest_rate).toFixed(2)}%` : '—'}</p>
                          </div>
                          <div>
                            <p className="text-slate-500">Currency</p>
                            <p className="text-slate-200">{account.currency ?? 'USD'}</p>
                          </div>
                        </div>

                        {utilization !== null ? (
                          <div className="mt-4">
                            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                              <span>Utilization</span>
                              <span>{utilization.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 bg-slate-700/60 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${utilization > 70 ? 'bg-red-500' : utilization > 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${utilization}%` }}
                              />
                            </div>
                          </div>
                        ) : null}

                        <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                          <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-700/40">
                            <p className="text-slate-500">Monthly Fees</p>
                            <p className="text-slate-200 font-medium">{formatCurrency(stats.monthlyFees)}</p>
                          </div>
                          <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-700/40">
                            <p className="text-slate-500">Service Charges</p>
                            <p className="text-slate-200 font-medium">{formatCurrency(stats.serviceCharges)}</p>
                          </div>
                          <div className="bg-slate-900/60 rounded-lg p-2 border border-slate-700/40">
                            <p className="text-slate-500">YTD Fees</p>
                            <p className="text-slate-200 font-medium">{formatCurrency(stats.ytdTotal)}</p>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      ) : null}

      <FinanceModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingAccount ? 'Edit Account' : 'Add Account'}
      >
        <AccountForm
          form={form}
          setForm={setForm}
          submitting={upsertAccountMutation.isPending}
          submitLabel={editingAccount ? 'Save Changes' : 'Create Account'}
          onSubmit={(event) => {
            event.preventDefault()
            upsertAccountMutation.mutate()
          }}
        />
      </FinanceModal>
    </div>
  )
}

function PaymentForm({
  form,
  accounts,
  onSubmit,
  setForm,
  pending,
}: {
  form: PaymentFormState
  accounts: AccountRow[]
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  setForm: (updater: (current: PaymentFormState) => PaymentFormState) => void
  pending: boolean
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm text-slate-300">
          Payee Name
          <input
            className="input-base mt-1"
            value={form.payee_name}
            onChange={(event) => setForm((current) => ({ ...current, payee_name: event.target.value }))}
            required
          />
        </label>

        <label className="text-sm text-slate-300">
          Amount
          <input
            className="input-base mt-1"
            value={form.amount}
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
            inputMode="decimal"
            required
          />
        </label>

        <label className="text-sm text-slate-300">
          Source Account
          <select
            className="input-base mt-1"
            value={form.source_account_id}
            onChange={(event) => setForm((current) => ({ ...current, source_account_id: event.target.value }))}
            required
          >
            <option value="">Select account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.nickname || account.institution_name}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-300">
          Destination / Payee
          <input
            className="input-base mt-1"
            value={form.destination_account}
            onChange={(event) => setForm((current) => ({ ...current, destination_account: event.target.value }))}
          />
        </label>

        <label className="text-sm text-slate-300">
          Frequency
          <select
            className="input-base mt-1"
            value={form.frequency}
            onChange={(event) => setForm((current) => ({ ...current, frequency: event.target.value as PaymentFrequency }))}
          >
            {FREQUENCY_OPTIONS.map((frequency) => (
              <option key={frequency} value={frequency}>{frequency.replace('_', ' ')}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-slate-300">
          Start Date
          <input
            type="date"
            className="input-base mt-1"
            value={form.start_date}
            onChange={(event) => setForm((current) => ({ ...current, start_date: event.target.value }))}
            required
          />
        </label>

        <label className="text-sm text-slate-300">
          End Date (optional)
          <input
            type="date"
            className="input-base mt-1"
            value={form.end_date}
            onChange={(event) => setForm((current) => ({ ...current, end_date: event.target.value }))}
          />
        </label>

        {form.frequency === 'biweekly' ? (
          <label className="text-sm text-slate-300">
            Biweekly Day of Week
            <select
              className="input-base mt-1"
              value={form.biweekly_day}
              onChange={(event) => setForm((current) => ({ ...current, biweekly_day: event.target.value }))}
            >
              <option value="0">Sunday</option>
              <option value="1">Monday</option>
              <option value="2">Tuesday</option>
              <option value="3">Wednesday</option>
              <option value="4">Thursday</option>
              <option value="5">Friday</option>
              <option value="6">Saturday</option>
            </select>
          </label>
        ) : null}
      </div>

      <label className="text-sm text-slate-300 block">
        Notes
        <textarea
          className="input-base mt-1 min-h-24"
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
        />
      </label>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Scheduling…' : 'Schedule Payment'}
        </button>
      </div>
    </form>
  )
}

const dueClassName = (dueDate: string): string => {
  const due = new Date(dueDate)
  const today = startOfToday()
  const dueStart = new Date(due)
  dueStart.setHours(0, 0, 0, 0)

  if (dueStart.getTime() < today.getTime()) return 'border-red-500/30 bg-red-500/10'
  if (dueStart.getTime() === today.getTime()) return 'border-amber-500/30 bg-amber-500/10'
  return 'border-slate-700/50 bg-slate-800/40'
}

const computeBiweeklyAnchorDate = (startDate: string, weekday: string): string => {
  const base = new Date(startDate)
  const targetDay = Number(weekday)
  const currentDay = base.getDay()
  const shift = (targetDay - currentDay + 7) % 7
  base.setDate(base.getDate() + shift)
  return base.toISOString().split('T')[0]
}

export function PaymentsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const toast = useToastQueue()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<PaymentFormState>(defaultPaymentForm)

  const accountsQuery = useQuery({
    queryKey: ['payments-accounts', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<AccountRow[]> => {
      if (!user) return []
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .eq('owner_id', user.id)
        .is('deleted_at', null)
      if (error) throw error
      return (data ?? []) as AccountRow[]
    },
  })

  const paymentsQuery = useQuery({
    queryKey: ['scheduled-payments', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ScheduledPaymentRow[]> => {
      if (!user) return []
      const { data, error } = await supabase
        .from('scheduled_payments')
        .select('*')
        .eq('owner_id', user.id)
        .is('deleted_at', null)
        .order('next_due_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as ScheduledPaymentRow[]
    },
  })

  const paymentHistoryQuery = useQuery({
    queryKey: ['payment-history', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<PaymentHistoryRow[]> => {
      if (!user) return []
      const { data, error } = await supabase
        .from('payment_history')
        .select('id, scheduled_payment_id, amount, paid_date, status')
        .order('paid_date', { ascending: false })
        .limit(40)
      if (error) throw error
      return (data ?? []) as PaymentHistoryRow[]
    },
  })

  const accountNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const account of accountsQuery.data ?? []) {
      map.set(account.id, account.nickname || account.institution_name)
    }
    return map
  }, [accountsQuery.data])

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be signed in')
      if (!form.payee_name.trim() || !form.amount.trim() || !form.source_account_id || !form.start_date) {
        throw new Error('Payee, amount, source account, and start date are required')
      }

      const anchorDate = form.frequency === 'biweekly'
        ? computeBiweeklyAnchorDate(form.start_date, form.biweekly_day)
        : form.start_date

      const { error } = await supabase
        .from('scheduled_payments')
        .insert({
          owner_id: user.id,
          from_account_id: form.source_account_id,
          to_account_id: form.destination_account.trim() || null,
          payee_name: form.payee_name.trim(),
          amount: toNumber(form.amount),
          frequency: form.frequency,
          next_due_date: form.start_date,
          end_date: form.end_date || null,
          status: 'active',
          memo: form.notes.trim() || null,
          anchor_date: anchorDate,
        })

      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Payment scheduled successfully')
      setModalOpen(false)
      setForm(defaultPaymentForm())
      void queryClient.invalidateQueries({ queryKey: ['scheduled-payments', user?.id] })
      void queryClient.invalidateQueries({ queryKey: ['payment-history', user?.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Unable to schedule payment')
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ paymentId, status }: { paymentId: string; status: PaymentStatus }) => {
      if (!user) throw new Error('You must be signed in')
      const { error } = await supabase
        .from('scheduled_payments')
        .update({ status })
        .eq('id', paymentId)
        .eq('owner_id', user.id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      toast.success(variables.status === 'paused' ? 'Payment paused' : 'Payment resumed')
      void queryClient.invalidateQueries({ queryKey: ['scheduled-payments', user?.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Unable to update payment')
    },
  })

  const deletePaymentMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      if (!user) throw new Error('You must be signed in')
      const { error } = await supabase
        .from('scheduled_payments')
        .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
        .eq('id', paymentId)
        .eq('owner_id', user.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Payment deleted')
      void queryClient.invalidateQueries({ queryKey: ['scheduled-payments', user?.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Unable to delete payment')
    },
  })

  return (
    <div className="space-y-6 animate-fade-in">
      <ToastViewport toasts={toast.toasts} onDismiss={toast.dismiss} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Payments</h1>
          <p className="text-sm text-slate-400 mt-1">Schedule recurring payments and monitor due statuses.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={15} /> Schedule Payment
        </button>
      </div>

      {(paymentsQuery.isLoading || paymentHistoryQuery.isLoading || accountsQuery.isLoading) && <SkeletonList rows={4} />}

      {(paymentsQuery.isError || paymentHistoryQuery.isError || accountsQuery.isError) ? (
        <EmptyState title="Unable to load payments" description="Please refresh and try again." />
      ) : null}

      {!paymentsQuery.isLoading && !paymentsQuery.isError && (paymentsQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="No scheduled payments"
          description="Create your first scheduled payment to start automating bills."
          cta={<button type="button" className="btn-primary" onClick={() => setModalOpen(true)}><Plus size={14} /> Schedule Payment</button>}
        />
      ) : null}

      {!paymentsQuery.isLoading && !paymentsQuery.isError && (paymentsQuery.data ?? []).length > 0 ? (
        <div className="space-y-3">
          {(paymentsQuery.data ?? []).map((payment) => (
            <article key={payment.id} className={`card p-4 border ${dueClassName(payment.next_due_date)}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-slate-100 font-semibold">{payment.payee_name || 'Payment'}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {payment.frequency.replace('_', ' ')} · Source: {accountNameById.get(payment.from_account_id) ?? 'Unknown account'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Due: {formatDateLabel(payment.next_due_date)}</p>
                  <p className="text-xs mt-1 uppercase tracking-wide text-slate-400">Status: {payment.status}</p>
                </div>

                <div className="text-right">
                  <p className="text-lg font-semibold text-slate-100">{formatCurrency(payment.amount)}</p>
                  <div className="flex gap-1 justify-end mt-2">
                    {payment.status === 'active' ? (
                      <button
                        type="button"
                        className="btn-ghost p-2"
                        onClick={() => updateStatusMutation.mutate({ paymentId: payment.id, status: 'paused' })}
                      >
                        <Pause size={14} />
                      </button>
                    ) : payment.status === 'paused' ? (
                      <button
                        type="button"
                        className="btn-ghost p-2"
                        onClick={() => updateStatusMutation.mutate({ paymentId: payment.id, status: 'active' })}
                      >
                        <Play size={14} />
                      </button>
                    ) : null}
                    <button type="button" className="btn-danger p-2" onClick={() => deletePaymentMutation.mutate(payment.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <section className="card p-4">
        <h2 className="text-base font-semibold text-slate-100 mb-3 flex items-center gap-2">
          <CalendarClock size={15} className="text-brand-400" /> Payment History
        </h2>

        {(paymentHistoryQuery.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-500">No payment history yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-700/60">
                  <th className="py-2">Date Paid</th>
                  <th className="py-2">Amount</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Account</th>
                </tr>
              </thead>
              <tbody>
                {(paymentHistoryQuery.data ?? []).map((entry) => {
                  const payment = (paymentsQuery.data ?? []).find((item) => item.id === entry.scheduled_payment_id)
                  const accountLabel = payment ? (accountNameById.get(payment.from_account_id) ?? 'Unknown account') : 'Unknown account'
                  return (
                    <tr key={entry.id} className="border-b border-slate-800/60">
                      <td className="py-2 text-slate-300">{formatDateLabel(entry.paid_date)}</td>
                      <td className="py-2 text-slate-200">{formatCurrency(entry.amount)}</td>
                      <td className="py-2 text-slate-400 uppercase text-xs">{entry.status}</td>
                      <td className="py-2 text-slate-400">{accountLabel}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FinanceModal open={modalOpen} onClose={() => setModalOpen(false)} title="Schedule Payment">
        <PaymentForm
          form={form}
          accounts={accountsQuery.data ?? []}
          setForm={setForm}
          pending={scheduleMutation.isPending}
          onSubmit={(event) => {
            event.preventDefault()
            scheduleMutation.mutate()
          }}
        />
      </FinanceModal>
    </div>
  )
}

export function AnalyticsPage() {
  const { user } = useAuthStore()

  const accountsQuery = useQuery({
    queryKey: ['analytics-accounts', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<AccountRow[]> => {
      if (!user) return []
      const { data, error } = await supabase
        .from('financial_accounts')
        .select('*')
        .eq('owner_id', user.id)
        .is('deleted_at', null)
      if (error) throw error
      return (data ?? []) as AccountRow[]
    },
  })

  const transactionsQuery = useQuery({
    queryKey: ['analytics-transactions', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<TransactionRow[]> => {
      if (!user) return []
      const { data, error } = await supabase
        .from('transactions')
        .select('id, account_id, owner_id, amount, category, description, transaction_date')
        .eq('owner_id', user.id)
      if (error) throw error
      return (data ?? []) as TransactionRow[]
    },
  })

  const snapshotsQuery = useQuery({
    queryKey: ['analytics-snapshots', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<AccountSnapshotRow[]> => {
      if (!user) return []
      const { data, error } = await supabase
        .from('account_snapshots')
        .select('id, account_id, balance, snapshot_date')
        .order('snapshot_date', { ascending: true })
      if (error) throw error
      return (data ?? []) as AccountSnapshotRow[]
    },
  })

  const loyaltyTransactionsQuery = useQuery({
    queryKey: ['analytics-loyalty-transactions', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<LoyaltyTransactionRow[]> => {
      if (!user) return []

      const { data: programs, error: programsError } = await supabase
        .from('loyalty_programs')
        .select('id')
        .eq('owner_id', user.id)
        .is('deleted_at', null)

      if (programsError) throw programsError

      const programIds = (programs ?? []).map((program) => String(program.id))
      if (programIds.length === 0) return []

      const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('id, program_id, transaction_type, points_amount, cash_value, description, transaction_date')
        .in('program_id', programIds)

      if (error) throw error
      return (data ?? []) as LoyaltyTransactionRow[]
    },
  })

  const totals = useMemo(() => {
    const accounts = accountsQuery.data ?? []
    const assets = accounts.filter((account) => account.current_balance > 0).reduce((sum, account) => sum + account.current_balance, 0)
    const debt = accounts.filter((account) => account.current_balance < 0).reduce((sum, account) => sum + Math.abs(account.current_balance), 0)
    return { assets, debt }
  }, [accountsQuery.data])

  const cardCostAnalysis = useMemo(() => {
    return (accountsQuery.data ?? [])
      .filter((account) => account.account_type === 'credit_card')
      .map((account) => {
        const apr = normalizeRate(account.interest_rate)
        const annualCost = Math.abs(account.current_balance) * (apr / 100)
        return {
          id: account.id,
          name: account.nickname || account.institution_name,
          apr,
          annualCost,
        }
      })
      .sort((a, b) => b.annualCost - a.annualCost)
  }, [accountsQuery.data])

  const interestEarnedAnalysis = useMemo(() => {
    return (accountsQuery.data ?? [])
      .filter((account) => account.account_type === 'savings' || account.account_type === 'investment' || account.account_type === 'retirement')
      .map((account) => {
        const rate = normalizeRate(account.interest_rate)
        const annualEarn = Math.max(account.current_balance, 0) * (rate / 100)
        return {
          id: account.id,
          name: account.nickname || account.institution_name,
          rate,
          annualEarn,
        }
      })
  }, [accountsQuery.data])

  const netWorthTrend = useMemo(() => {
    const accountMap = new Map((accountsQuery.data ?? []).map((account) => [account.id, account]))
    const grouped = new Map<string, number>()

    for (const snapshot of snapshotsQuery.data ?? []) {
      if (!accountMap.has(snapshot.account_id)) continue
      const key = snapshot.snapshot_date
      grouped.set(key, (grouped.get(key) ?? 0) + snapshot.balance)
    }

    return Array.from(grouped.entries())
      .map(([date, value]) => ({
        label: date,
        value,
      }))
      .sort((a, b) => new Date(a.label).getTime() - new Date(b.label).getTime())
      .map((point) => ({
        label: formatDateLabel(point.label),
        value: point.value,
      }))
  }, [accountsQuery.data, snapshotsQuery.data])

  const monthlySpendByCategory = useMemo(() => {
    const now = new Date()
    const month = now.getMonth()
    const year = now.getFullYear()

    const grouped = new Map<string, number>()

    for (const transaction of transactionsQuery.data ?? []) {
      const date = new Date(transaction.transaction_date)
      if (date.getMonth() !== month || date.getFullYear() !== year) continue
      const key = transaction.category ?? 'uncategorized'
      grouped.set(key, (grouped.get(key) ?? 0) + Math.abs(transaction.amount))
    }

    return Array.from(grouped.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [transactionsQuery.data])

  const ytdFeeTotal = useMemo(() => {
    const ytdStart = ytdStartDate()
    return (transactionsQuery.data ?? [])
      .filter((transaction) => (transaction.category ?? '').toLowerCase() === 'fee')
      .filter((transaction) => new Date(transaction.transaction_date) >= ytdStart)
      .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)
  }, [transactionsQuery.data])

  const ytdRewardsRedeemed = useMemo(() => {
    const ytdStart = ytdStartDate()
    return (loyaltyTransactionsQuery.data ?? [])
      .filter((entry) => entry.transaction_type === 'redeem')
      .filter((entry) => new Date(entry.transaction_date) >= ytdStart)
      .reduce((sum, entry) => sum + (entry.cash_value ?? 0), 0)
  }, [loyaltyTransactionsQuery.data])

  const loading = accountsQuery.isLoading || transactionsQuery.isLoading || snapshotsQuery.isLoading || loyaltyTransactionsQuery.isLoading
  const failed = accountsQuery.isError || transactionsQuery.isError || snapshotsQuery.isError || loyaltyTransactionsQuery.isError

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
        <p className="text-sm text-slate-400 mt-1">Debt vs assets, interest impact, net worth trend, and rewards value.</p>
      </div>

      {loading ? <SkeletonList rows={5} /> : null}

      {failed ? <EmptyState title="Unable to load analytics" description="Please refresh and try again." /> : null}

      {!loading && !failed ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="card p-4 bg-slate-900/80 border-emerald-500/20">
              <p className="text-xs uppercase tracking-wider text-slate-400">Total Assets</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{formatCurrency(totals.assets)}</p>
            </div>
            <div className="card p-4 bg-slate-900/80 border-red-500/20">
              <p className="text-xs uppercase tracking-wider text-slate-400">Total Debt</p>
              <p className="text-2xl font-bold text-red-400 mt-1">{formatCurrency(totals.debt)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="card p-4">
              <h2 className="text-base font-semibold text-slate-100 mb-3">Credit Card Cost Analysis</h2>
              {cardCostAnalysis.length === 0 ? (
                <p className="text-sm text-slate-500">No credit card accounts found.</p>
              ) : (
                <div className="space-y-2">
                  {cardCostAnalysis.map((item) => (
                    <div key={item.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-900/40">
                      <p className="text-sm text-slate-200 font-medium">{item.name}</p>
                      <p className="text-xs text-slate-400 mt-1">Effective APR: {item.apr.toFixed(2)}%</p>
                      <p className="text-xs text-amber-300 mt-1">Estimated annual interest cost: {formatCurrency(item.annualCost)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="card p-4">
              <h2 className="text-base font-semibold text-slate-100 mb-3">Interest Earned (Savings/Investments)</h2>
              {interestEarnedAnalysis.length === 0 ? (
                <p className="text-sm text-slate-500">No savings or investment accounts found.</p>
              ) : (
                <div className="space-y-2">
                  {interestEarnedAnalysis.map((item) => (
                    <div key={item.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-900/40">
                      <p className="text-sm text-slate-200 font-medium">{item.name}</p>
                      <p className="text-xs text-slate-400 mt-1">Interest rate: {item.rate.toFixed(2)}%</p>
                      <p className="text-xs text-emerald-300 mt-1">Estimated annual earn: {formatCurrency(item.annualEarn)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section>
              <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-400 mb-2">Net Worth Trend</h2>
              <SimpleLineChart points={netWorthTrend} color="#10B981" />
            </section>

            <section>
              <h2 className="text-sm uppercase tracking-wider font-semibold text-slate-400 mb-2">Monthly Spend by Category</h2>
              <SimpleBarChart points={monthlySpendByCategory} color="#F59E0B" />
            </section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="card p-4 border-amber-500/20">
              <p className="text-xs uppercase tracking-wider text-slate-400">Fee Tracker (YTD)</p>
              <p className="text-xl font-semibold text-amber-300 mt-1">{formatCurrency(ytdFeeTotal)}</p>
            </div>
            <div className="card p-4 border-emerald-500/20">
              <p className="text-xs uppercase tracking-wider text-slate-400">Rewards Redeemed Cash Value (YTD)</p>
              <p className="text-xl font-semibold text-emerald-300 mt-1">{formatCurrency(ytdRewardsRedeemed)}</p>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}

function RewardsProgramForm({
  form,
  setForm,
  onSubmit,
  pending,
}: {
  form: ProgramFormState
  setForm: (updater: (current: ProgramFormState) => ProgramFormState) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  pending: boolean
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-sm text-slate-300">
          Program Name
          <input
            className="input-base mt-1"
            value={form.program_name}
            onChange={(event) => setForm((current) => ({ ...current, program_name: event.target.value }))}
            required
          />
        </label>

        <label className="text-sm text-slate-300">
          Type
          <select
            className="input-base mt-1"
            value={form.program_type}
            onChange={(event) => setForm((current) => ({ ...current, program_type: event.target.value as ProgramType }))}
          >
            <option value="points">Points</option>
            <option value="miles">Miles</option>
            <option value="cashback">Cashback</option>
          </select>
        </label>

        <label className="text-sm text-slate-300">
          Account Number
          <input
            className="input-base mt-1"
            value={form.account_number}
            onChange={(event) => setForm((current) => ({ ...current, account_number: event.target.value }))}
            required
          />
        </label>

        <label className="text-sm text-slate-300">
          Current Points / Miles Balance
          <input
            className="input-base mt-1"
            value={form.points_balance}
            onChange={(event) => setForm((current) => ({ ...current, points_balance: event.target.value }))}
            inputMode="decimal"
            required
          />
        </label>

        <label className="text-sm text-slate-300">
          Value Per Point
          <input
            className="input-base mt-1"
            value={form.value_per_point}
            onChange={(event) => setForm((current) => ({ ...current, value_per_point: event.target.value }))}
            inputMode="decimal"
            required
          />
        </label>

        <label className="text-sm text-slate-300">
          Tier Status
          <input
            className="input-base mt-1"
            value={form.tier_status}
            onChange={(event) => setForm((current) => ({ ...current, tier_status: event.target.value }))}
          />
        </label>

        <label className="text-sm text-slate-300">
          Expiration Date
          <input
            type="date"
            className="input-base mt-1"
            value={form.expiration_date}
            onChange={(event) => setForm((current) => ({ ...current, expiration_date: event.target.value }))}
          />
        </label>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Saving…' : 'Add Program'}
        </button>
      </div>
    </form>
  )
}

export function RewardsPage() {
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const toast = useToastQueue()

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ProgramFormState>(defaultProgramForm)

  const programsQuery = useQuery({
    queryKey: ['loyalty-programs', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<LoyaltyProgramRow[]> => {
      if (!user) return []
      const { data, error } = await supabase
        .from('loyalty_programs')
        .select('*')
        .eq('owner_id', user.id)
        .is('deleted_at', null)
      if (error) throw error
      return (data ?? []) as LoyaltyProgramRow[]
    },
  })

  const loyaltyTransactionsQuery = useQuery({
    queryKey: ['loyalty-transactions', user?.id, (programsQuery.data ?? []).length],
    queryFn: async (): Promise<LoyaltyTransactionRow[]> => {
      const programIds = (programsQuery.data ?? []).map((program) => program.id)
      if (programIds.length === 0) return []

      const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('id, program_id, transaction_type, points_amount, cash_value, description, transaction_date')
        .in('program_id', programIds)
        .order('transaction_date', { ascending: false })

      if (error) throw error
      return (data ?? []) as LoyaltyTransactionRow[]
    },
    enabled: Boolean(user?.id) && (programsQuery.data ?? []).length > 0,
  })

  const addProgramMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be signed in')
      if (!form.program_name.trim() || !form.account_number.trim() || !form.points_balance.trim() || !form.value_per_point.trim()) {
        throw new Error('Program name, account number, balance, and value per point are required')
      }

      const { error } = await supabase
        .from('loyalty_programs')
        .insert({
          owner_id: user.id,
          program_name: form.program_name.trim(),
          program_type: form.program_type,
          account_number: form.account_number.trim(),
          points_balance: toNumber(form.points_balance),
          value_per_point: toNumber(form.value_per_point),
          tier_status: form.tier_status.trim() || null,
          expiration_date: form.expiration_date || null,
        })

      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Loyalty program added')
      setModalOpen(false)
      setForm(defaultProgramForm())
      void queryClient.invalidateQueries({ queryKey: ['loyalty-programs', user?.id] })
      void queryClient.invalidateQueries({ queryKey: ['loyalty-transactions', user?.id] })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Unable to add loyalty program')
    },
  })

  const programMap = useMemo(() => {
    const map = new Map<string, LoyaltyProgramRow>()
    for (const program of programsQuery.data ?? []) {
      map.set(program.id, program)
    }
    return map
  }, [programsQuery.data])

  const totalPortfolioValue = useMemo(() => {
    return (programsQuery.data ?? []).reduce((sum, program) => {
      return sum + (program.points_balance * program.value_per_point)
    }, 0)
  }, [programsQuery.data])

  const redemptions = useMemo(() => {
    return (loyaltyTransactionsQuery.data ?? [])
      .filter((entry) => entry.transaction_type === 'redeem')
      .slice(0, 10)
  }, [loyaltyTransactionsQuery.data])

  const earnings = useMemo(() => {
    return (loyaltyTransactionsQuery.data ?? [])
      .filter((entry) => entry.transaction_type !== 'redeem')
      .slice(0, 10)
  }, [loyaltyTransactionsQuery.data])

  return (
    <div className="space-y-6 animate-fade-in">
      <ToastViewport toasts={toast.toasts} onDismiss={toast.dismiss} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Rewards</h1>
          <p className="text-sm text-slate-400 mt-1">Track loyalty balances, redemptions, earnings, and portfolio value.</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
          <Plus size={15} /> Add Program
        </button>
      </div>

      <div className="card p-4 border-amber-500/20">
        <p className="text-xs uppercase tracking-wider text-slate-400">Total Rewards Portfolio Value</p>
        <p className="text-2xl font-semibold text-amber-300 mt-1">{formatCurrency(totalPortfolioValue)}</p>
      </div>

      {programsQuery.isLoading ? <SkeletonList rows={4} /> : null}

      {programsQuery.isError ? (
        <EmptyState title="Unable to load rewards programs" description="Please refresh and try again." />
      ) : null}

      {!programsQuery.isLoading && !programsQuery.isError && (programsQuery.data ?? []).length === 0 ? (
        <EmptyState
          title="No loyalty programs yet"
          description="Add credit card rewards, airline miles, hotel points, or cashback programs to start tracking value."
          cta={<button type="button" className="btn-primary" onClick={() => setModalOpen(true)}><Plus size={14} /> Add Program</button>}
        />
      ) : null}

      {!programsQuery.isLoading && !programsQuery.isError && (programsQuery.data ?? []).length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {(programsQuery.data ?? []).map((program) => {
            const estimatedCashValue = program.points_balance * program.value_per_point
            return (
              <article key={program.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-slate-100 font-semibold">{program.program_name}</p>
                    <p className="text-xs text-slate-400 mt-1 capitalize">{program.program_type}</p>
                    <p className="text-xs text-slate-500 mt-1">Account: {maskAccountNumber(program.account_number)}</p>
                  </div>
                  <Trophy size={18} className="text-amber-400" />
                </div>

                <div className="grid grid-cols-2 gap-2 mt-4 text-sm">
                  <div>
                    <p className="text-slate-500">Balance</p>
                    <p className="text-slate-200 font-medium">{program.points_balance.toLocaleString('en-US')}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Est. Cash Value</p>
                    <p className="text-emerald-300 font-medium">{formatCurrency(estimatedCashValue)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Tier</p>
                    <p className="text-slate-300">{program.tier_status || '—'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Expiration</p>
                    <p className="text-slate-300">{program.expiration_date ? formatDateLabel(program.expiration_date) : '—'}</p>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="card p-4">
          <h2 className="text-base font-semibold text-slate-100 mb-3">Recent Redemptions</h2>
          {redemptions.length === 0 ? (
            <p className="text-sm text-slate-500">No redemption activity yet.</p>
          ) : (
            <div className="space-y-2">
              {redemptions.map((entry) => {
                const program = programMap.get(entry.program_id)
                return (
                  <div key={entry.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-900/40">
                    <p className="text-sm text-slate-200">{entry.description || 'Redemption'}</p>
                    <p className="text-xs text-slate-400 mt-1">{program?.program_name ?? 'Unknown program'} · {formatDateLabel(entry.transaction_date)}</p>
                    <p className="text-xs text-amber-300 mt-1">{entry.points_amount.toLocaleString('en-US')} points · {formatCurrency(entry.cash_value ?? 0)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="card p-4">
          <h2 className="text-base font-semibold text-slate-100 mb-3">Recent Earnings</h2>
          {earnings.length === 0 ? (
            <p className="text-sm text-slate-500">No earnings activity yet.</p>
          ) : (
            <div className="space-y-2">
              {earnings.map((entry) => {
                const program = programMap.get(entry.program_id)
                return (
                  <div key={entry.id} className="border border-slate-700/50 rounded-lg p-3 bg-slate-900/40">
                    <p className="text-sm text-slate-200">{entry.description || 'Points earned'}</p>
                    <p className="text-xs text-slate-400 mt-1">{program?.program_name ?? 'Unknown program'} · {formatDateLabel(entry.transaction_date)}</p>
                    <p className="text-xs text-emerald-300 mt-1">+{entry.points_amount.toLocaleString('en-US')} points</p>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      <FinanceModal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Loyalty Program">
        <RewardsProgramForm
          form={form}
          setForm={setForm}
          pending={addProgramMutation.isPending}
          onSubmit={(event) => {
            event.preventDefault()
            addProgramMutation.mutate()
          }}
        />
      </FinanceModal>
    </div>
  )
}

export function TravelPage() {
  return <ComingSoon title="Travel & Miles" desc="Travel Agent — Phase 4" />
}
export function HealthPage() {
  return <ComingSoon title="Health" desc="Health Agent — Phase 4" />
}
export function JobsPage() {
  return <ComingSoon title="Jobs & Career" desc="Jobs Agent — Phase 4" />
}
export function SettingsPage() {
  return <ComingSoon title="Settings" desc="Coming soon" />
}
export function PrivacyPage() {
  return <ComingSoon title="Privacy Policy" desc="Privacy details coming soon" />
}
export function TermsPage() {
  return <ComingSoon title="Terms of Service" desc="Terms details coming soon" />
}

function ComingSoon({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center animate-fade-in">
      <div className="text-4xl mb-4">🔧</div>
      <h1 className="text-xl font-bold text-slate-200">{title}</h1>
      <p className="text-sm text-slate-400 mt-2">{desc}</p>
      <p className="text-xs text-slate-500 mt-4">
        Paste an image (Ctrl+V) to scan documents into any section
      </p>
    </div>
  )
}
