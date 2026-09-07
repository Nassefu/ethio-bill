import { useEffect, useMemo, useState } from 'react'
import { enablePushNotifications } from './firebase'
import './App.css'

const starterBills = [
  { id: 1, name: 'Electricity', recurringPeriod: 'Monthly', amount: 820, due: 'Sep 08', paymentName: 'Telebirr', paymentNumber: '0911 23 45 67', color: 'sun', icon: '↯', paid: false },
  { id: 2, name: 'Internet', recurringPeriod: 'Monthly', amount: 1250, due: 'Sep 12', paymentName: 'CBE Birr', paymentNumber: '0911 23 45 67', color: 'blue', icon: '⌁', paid: false },
  { id: 3, name: 'School transport', recurringPeriod: 'Weekly', amount: 2800, due: 'Sep 15', paymentName: 'Cash', paymentNumber: '', color: 'rose', icon: '↗', paid: false },
  { id: 4, name: 'House rent', recurringPeriod: 'Monthly', amount: 12000, due: 'Sep 01', paymentName: 'Awash Bank', paymentNumber: '**** 2048', color: 'violet', icon: '⌂', paid: true },
]

const currency = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const ethiopianMonths = ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miazia', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume']
const ethiopianDays = Array.from({ length: 30 }, (_, index) => index + 1)
const reminderTypes = ['7-day', '3-day', '1-day', 'due-today', 'overdue']

function getEthiopianToday() {
  const parts = new Intl.DateTimeFormat('en-u-ca-ethiopic', { day: 'numeric', month: 'numeric' }).formatToParts(new Date())
  return { day: parts.find((part) => part.type === 'day')?.value, month: ethiopianMonths[Number(parts.find((part) => part.type === 'month')?.value) - 1] }
}

function parseBillDueDate(value) {
  if (!value || typeof value !== 'string') return null

  const tokens = value.trim().split(/\s+/).filter(Boolean)
  if (!tokens.length) return null

  const [firstToken, secondToken] = tokens
  const numericValue = Number(firstToken)
  const day = Number.isFinite(numericValue) ? numericValue : Number(secondToken)
  const monthToken = Number.isFinite(numericValue) ? secondToken : firstToken

  if (!Number.isFinite(day) || !monthToken) return null

  const monthName = monthToken.trim()
  const ethiopianIndex = ethiopianMonths.findIndex((month) => month.toLowerCase() === monthName.toLowerCase())
  if (ethiopianIndex >= 0) {
    return new Date(new Date().getFullYear(), (ethiopianIndex + 8) % 12, day)
  }

  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  }

  const shortMonth = monthName.slice(0, 3).toLowerCase()
  const jsMonthIndex = monthMap[shortMonth]
  if (jsMonthIndex === undefined) return null

  return new Date(new Date().getFullYear(), jsMonthIndex, day)
}

function isValidDueDate(dayValue, monthName) {
  if (!Number.isInteger(Number(dayValue))) return false

  const day = Number(dayValue)
  if (day < 1 || day > 30) return false
  if (!monthName || !ethiopianMonths.includes(monthName)) return false

  return true
}

function validateBillForm({ name, amount, dueDay, dueMonth, paymentName }) {
  const errors = {}

  const billName = String(name || '').trim()
  if (!billName) errors.name = 'Bill name is required.'

  const paymentLabel = String(paymentName || '').trim()
  if (!paymentLabel) errors.paymentName = 'Bank or wallet is required.'

  const numAmount = Number(amount)
  if (!Number.isFinite(numAmount) || numAmount <= 0) errors.amount = 'Enter a valid amount greater than 0.'

  if (!isValidDueDate(dueDay, dueMonth)) errors.due = 'Choose a valid Ethiopian due date.'

  return errors
}

function normalizeBillRecord(bill) {
  const amount = Number(bill.amount)
  const paymentName = String(bill.paymentName || '').trim()
  const paymentNumber = String(bill.paymentNumber || '').trim()

  return {
    ...bill,
    id: Number(bill.id) || Date.now(),
    name: String(bill.name || '').trim(),
    recurringPeriod: bill.recurringPeriod || 'Monthly',
    amount: Number.isFinite(amount) ? amount : 0,
    due: typeof bill.due === 'string' ? bill.due.trim() : '',
    paymentName,
    paymentNumber,
    color: bill.color || 'mint',
    icon: bill.icon || '＋',
    paid: Boolean(bill.paid),
  }
}

function getReminderState(bill) {
  if (!bill || bill.paid) return null

  const dueDate = parseBillDueDate(bill.due)
  if (!dueDate || Number.isNaN(dueDate.getTime())) return null

  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((dueDate.getTime() - startOfToday.getTime()) / 86400000)

  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'due-today'
  if (diffDays === 1) return '1-day'
  if (diffDays === 3) return '3-day'
  if (diffDays === 7) return '7-day'
  return null
}

function getReminderHistory() {
  try {
    return JSON.parse(localStorage.getItem('ethio-reminder-history') || '[]')
  } catch {
    return []
  }
}

function saveReminderHistory(items) {
  localStorage.setItem('ethio-reminder-history', JSON.stringify(items.slice(0, 200)))
}

function recordReminderHistory(bill, reminderType) {
  const history = getReminderHistory()
  const duplicateKey = `${bill.id}-${bill.due}-${reminderType}`
  const exists = history.some((entry) => `${entry.billId}-${entry.due}-${entry.reminderType}` === duplicateKey)

  if (exists) return false

  history.unshift({
    id: `${bill.id}-${reminderType}-${Date.now()}`,
    billId: bill.id,
    billName: bill.name,
    reminderType,
    due: bill.due,
    sentAt: new Date().toISOString(),
  })

  saveReminderHistory(history)
  return true
}

function App() {
  const [bills, setBills] = useState(() => {
    try {
      const savedBills = JSON.parse(localStorage.getItem('ethio-bills'))
      return (savedBills || starterBills).map((bill) => {
        const normalized = normalizeBillRecord(bill)
        if (bill.paymentName || bill.paymentNumber) return { ...normalized, recurringPeriod: normalized.recurringPeriod || 'Monthly' }
        const [paymentName, ...numberParts] = (bill.paymentAccount || 'Add payment account').split(' · ')
        return { ...normalized, paymentName: paymentName || normalized.paymentName, paymentNumber: numberParts.join(' · ') || normalized.paymentNumber }
      })
    } catch { return starterBills }
  })
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBillId, setEditingBillId] = useState(null)
  const [formError, setFormError] = useState('')
  const [statusMessage, setStatusMessage] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('Bills')
  const [copiedAccountId, setCopiedAccountId] = useState(null)
  const [notificationPermission, setNotificationPermission] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'))

  const editingBill = useMemo(() => bills.find((bill) => bill.id === editingBillId) || null, [bills, editingBillId])

  useEffect(() => {
    if (!statusMessage) return undefined

    const timer = window.setTimeout(() => setStatusMessage(null), 2200)
    return () => window.clearTimeout(timer)
  }, [statusMessage])

  useEffect(() => localStorage.setItem('ethio-bills', JSON.stringify(bills)), [bills])
  useEffect(() => {
    if (notificationPermission !== 'granted') return undefined

    const checkReminderQueue = () => {
      bills.forEach((bill) => {
        const reminderType = getReminderState(bill)
        if (!reminderType || !reminderTypes.includes(reminderType)) return

        const notificationKey = `notified-${bill.id}-${reminderType}-${bill.due}`
        if (localStorage.getItem(notificationKey)) return

        const shouldStore = recordReminderHistory(bill, reminderType)
        if (shouldStore) {
          new Notification(`${bill.name} reminder`, {
            body: `${reminderType} · ${bill.paymentName} · ${currency.format(bill.amount)} ETB`,
            tag: notificationKey,
          })
        }

        localStorage.setItem(notificationKey, 'true')
      })
    }

    checkReminderQueue()
    const interval = window.setInterval(checkReminderQueue, 60_000)
    return () => window.clearInterval(interval)
  }, [bills, notificationPermission])
  const visibleBills = useMemo(() => bills.filter((bill) => `${bill.name} ${bill.recurringPeriod} ${bill.paymentName} ${bill.paymentNumber}`.toLowerCase().includes(query.toLowerCase())), [bills, query])
  const dueTotal = bills.filter((bill) => !bill.paid).reduce((total, bill) => total + bill.amount, 0)

  function togglePaid(id) {
    setBills((current) => current.map((bill) => bill.id === id ? { ...bill, paid: !bill.paid } : bill))
  }

  async function copyAccount(id, accountNumber) {
    await navigator.clipboard.writeText(accountNumber || '')
    setCopiedAccountId(id)
    window.setTimeout(() => setCopiedAccountId(null), 1600)
  }

  async function enableNotifications() {
    const result = await enablePushNotifications()
    if (result.status === 'enabled') {
      setNotificationPermission('granted')
      localStorage.setItem('fcm-token', result.token)
      return
    }
    if (result.status === 'denied') setNotificationPermission('denied')
    if (result.status === 'missing-vapid-key') window.alert('Add VITE_FIREBASE_VAPID_KEY to enable background push notifications.')
  }

  function openNewBillModal() {
    setEditingBillId(null)
    setFormError('')
    setIsModalOpen(true)
  }

  function openEditBillModal(bill) {
    setEditingBillId(bill.id)
    setFormError('')
    setIsModalOpen(true)
  }

  function closeBillModal() {
    setIsModalOpen(false)
    setEditingBillId(null)
    setFormError('')
  }

  function saveBill(event) {
    event.preventDefault()
    setIsSubmitting(true)

    const form = new FormData(event.currentTarget)
    const payload = {
      name: form.get('name'),
      recurringPeriod: form.get('recurringPeriod'),
      amount: form.get('amount'),
      dueDay: form.get('dueDay'),
      dueMonth: form.get('dueMonth'),
      paymentName: form.get('paymentName'),
      paymentNumber: form.get('paymentNumber'),
    }

    const errors = validateBillForm(payload)
    if (Object.keys(errors).length > 0) {
      setStatusMessage({ type: 'error', text: Object.values(errors)[0] })
      setFormError(Object.values(errors)[0])
      setIsSubmitting(false)
      return
    }

    const nextBill = {
      id: editingBillId ?? Date.now(),
      name: String(payload.name).trim(),
      recurringPeriod: String(payload.recurringPeriod || 'Monthly'),
      amount: Number(payload.amount),
      due: `${payload.dueDay} ${payload.dueMonth}`,
      paymentName: String(payload.paymentName || '').trim(),
      paymentNumber: String(payload.paymentNumber || '').trim(),
      color: editingBill?.color || 'mint',
      icon: editingBill?.icon || '＋',
      paid: editingBill?.paid || false,
    }

    setBills((current) => {
      if (editingBillId) {
        return current.map((bill) => bill.id === editingBillId ? nextBill : bill)
      }

      return [...current, nextBill]
    })

    setStatusMessage({ type: 'success', text: editingBillId ? 'Bill saved.' : 'Bill added.' })
    setIsSubmitting(false)
    closeBillModal()
  }

  function deleteBill(id) {
    setBills((current) => current.filter((bill) => bill.id !== id))
    setStatusMessage({ type: 'success', text: 'Bill deleted.' })
  }

  function sendReminderNow(bill) {
    const reminderType = 'send-now'
    const wasAdded = recordReminderHistory({ ...bill, due: bill.due }, reminderType)

    if (wasAdded) {
      setBills((current) => current.map((entry) => entry.id === bill.id ? { ...entry, lastReminderType: reminderType, lastReminderSentAt: new Date().toISOString() } : entry))
      setStatusMessage({ type: 'success', text: 'Reminder sent.' })
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`${bill.name} reminder sent`, { body: `${bill.paymentName} · ${currency.format(bill.amount)} ETB`, tag: `manual-${bill.id}-${Date.now()}` })
      }
    } else {
      setStatusMessage({ type: 'error', text: 'Reminder already sent.' })
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar"><div className="brand"><span className="brand-mark">✦</span><span>Ethio Bill</span></div><div className="top-actions"><button className={`notification-button ${notificationPermission === 'granted' ? 'enabled' : ''}`} onClick={enableNotifications} aria-label="Enable due date notifications">♧<i></i></button><button className="profile-button" aria-label="Open profile"><span>NA</span><i>⌄</i></button></div></header>
      <main className="content-wrap">
        <section className="welcome"><div><p className="eyebrow">SUNDAY, SEPTEMBER 6, 2026</p><h1>Good morning, Nassefu <span>☀</span></h1><p className="subhead">Your bills, kept simple.</p></div><button className="primary-button" onClick={openNewBillModal}><span>＋</span> Add bill</button></section>
        <section className="summary"><div><p>To pay this month</p><strong>{currency.format(dueTotal)} <small>ETB</small></strong></div><div className="summary-count"><strong>{bills.filter((bill) => !bill.paid).length}</strong><span>open bills</span></div></section>
        {statusMessage && <div className={`status-banner ${statusMessage.type}`}>{statusMessage.text}</div>}
        <div className="list-heading"><div><h2>{activeTab === 'Bills' ? 'Upcoming bills' : 'Paid bills'}</h2><p>Choose the account you will use to pay.</p></div><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" /></label></div>
        <section className="bills-list">{visibleBills.filter((bill) => activeTab === 'Bills' ? !bill.paid : bill.paid).map((bill) => <article className="bill-card" key={bill.id}><div className={`bill-icon ${bill.color}`}>{bill.icon}</div><div className="bill-main"><div className="bill-title"><div><h3>{bill.name}</h3><p>{bill.recurringPeriod}</p></div><strong>{currency.format(bill.amount)} <small>ETB</small></strong></div><div className="bill-meta"><span className="due"><i></i>{bill.paid ? `Paid · ${bill.due}` : `Due ${bill.due}`}</span><button type="button" className="account-copy" onClick={() => copyAccount(bill.id, bill.paymentNumber)}><span className="account"><b>↗</b><strong>{bill.paymentName}</strong>{bill.paymentNumber && <em>{bill.paymentNumber}</em>}</span><b>{copiedAccountId === bill.id ? 'Copied' : 'Copy number'}</b></button></div><div className="bill-actions"><button className={`status ${bill.paid ? 'paid' : ''}`} onClick={() => togglePaid(bill.id)}>{bill.paid ? 'Paid' : 'Mark as paid'}</button>{!bill.paid && <button type="button" className="status secondary" onClick={() => sendReminderNow(bill)}>Send Now</button>}<button type="button" className="status secondary" onClick={() => openEditBillModal(bill)}>Edit</button><button type="button" className="status secondary" onClick={() => deleteBill(bill.id)}>Delete</button></div></div></article>)}{visibleBills.filter((bill) => activeTab === 'Bills' ? !bill.paid : bill.paid).length === 0 && <div className="empty">No bills here yet.</div>}</section>
      </main>
      <nav className="bottom-nav"><button className={activeTab === 'Bills' ? 'selected' : ''} onClick={() => setActiveTab('Bills')}><span>▤</span>Bills</button><button onClick={openNewBillModal} className="add-tab"><span>＋</span>Add</button><button className={activeTab === 'Paid' ? 'selected' : ''} onClick={() => setActiveTab('Paid')}><span>✓</span>Paid</button></nav>
      {isModalOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeBillModal()}><form className="modal" onSubmit={saveBill}><div className="modal-head"><div><p className="eyebrow">{editingBillId ? 'EDIT REMINDER' : 'NEW REMINDER'}</p><h2>{editingBillId ? 'Edit bill' : 'Add a bill'}</h2></div><button type="button" className="close-button" onClick={closeBillModal}>×</button></div><label>Bill name<input name="name" placeholder="e.g. Water bill" defaultValue={editingBill?.name || ''} required /></label><label>Recurring period<select name="recurringPeriod" defaultValue={editingBill?.recurringPeriod || 'Monthly'}><option>One-time</option><option>Weekly</option><option>Monthly</option><option>Quarterly</option><option>Yearly</option></select></label><label>Ethiopian due date</label><div className="form-row date-picker"><select name="dueDay" defaultValue={editingBill ? Number(String(editingBill.due).split(/\s+/)[0]) || 1 : 1} aria-label="Ethiopian day" required>{ethiopianDays.map((day) => <option key={day} value={day}>{day}</option>)}</select><select name="dueMonth" defaultValue={editingBill ? String(editingBill.due).split(/\s+/)[1] || ethiopianMonths[0] : ethiopianMonths[0]} aria-label="Ethiopian month" required>{ethiopianMonths.map((month) => <option key={month}>{month}</option>)}</select></div><div className="form-row"><label>Amount <span>(ETB)</span><input name="amount" type="number" min="1" step="1" placeholder="0" defaultValue={editingBill?.amount || ''} required /></label><div></div></div><div className="form-row"><label>Bank or wallet<input name="paymentName" placeholder="e.g. Telebirr" defaultValue={editingBill?.paymentName || ''} required /></label><label>Account number<input name="paymentNumber" placeholder="e.g. 0911 23 45 67" defaultValue={editingBill?.paymentNumber || ''} /></label></div><p className="form-help">Keep the payment name and number separate for easy copying.</p>{formError && <p className="form-error">{formError}</p>}<button className="primary-button full" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : editingBillId ? 'Save changes' : 'Save reminder'} <span>→</span></button></form></div>}
    </div>
  )
}

export default App
