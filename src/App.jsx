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
const TRIAL_DAYS = 60
const MONTHLY_PRICE = 30

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
  if (ethiopianIndex >= 0) return new Date(new Date().getFullYear(), (ethiopianIndex + 8) % 12, day)
  const monthMap = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
  const jsMonthIndex = monthMap[monthName.slice(0, 3).toLowerCase()]
  return jsMonthIndex === undefined ? null : new Date(new Date().getFullYear(), jsMonthIndex, day)
}

function normalizeBillRecord(bill) {
  return { ...bill, id: Number(bill.id) || Date.now(), name: String(bill.name || '').trim(), recurringPeriod: bill.recurringPeriod || 'Monthly', amount: Number(bill.amount) || 0, due: typeof bill.due === 'string' ? bill.due.trim() : '', paymentName: String(bill.paymentName || '').trim(), paymentNumber: String(bill.paymentNumber || '').trim(), color: bill.color || 'mint', icon: bill.icon || '＋', paid: Boolean(bill.paid) }
}

function getReminderState(bill) {
  if (!bill || bill.paid) return null
  const dueDate = parseBillDueDate(bill.due)
  if (!dueDate) return null
  const today = new Date()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diffDays = Math.round((dueDate - startOfToday) / 86400000)
  if (diffDays < 0) return 'overdue'
  if (diffDays === 0) return 'due-today'
  if ([1, 3, 7].includes(diffDays)) return `${diffDays}-day`
  return null
}

function getStoredCustomer() {
  try { return JSON.parse(localStorage.getItem('ethio-customer')) } catch { return null }
}

function getTrialState(customer) {
  if (!customer) return { status: 'unregistered', daysLeft: 0 }
  if (customer.subscriptionActive) return { status: 'subscribed', daysLeft: 0, trialEndsAt: customer.trialEndsAt }
  const end = new Date(customer.trialEndsAt).getTime()
  const now = Date.now()
  if (!Number.isFinite(end) || end <= now) return { status: 'expired', daysLeft: 0, trialEndsAt: customer.trialEndsAt }
  const daysLeft = Math.ceil((end - now) / 86400000)
  return { status: 'trial', daysLeft, trialEndsAt: customer.trialEndsAt }
}

function validateRegistration(name, phone) {
  const cleanName = String(name || '').trim()
  const cleanPhone = String(phone || '').replace(/\s+/g, '')
  if (!cleanName) return 'User name is required.'
  if (!/^\+?\d{9,15}$/.test(cleanPhone)) return 'Enter a valid phone number.'
  return null
}

function App() {
  const [customer, setCustomer] = useState(getStoredCustomer)
  const [showRegistration, setShowRegistration] = useState(() => !getStoredCustomer())
  const [showSubscription, setShowSubscription] = useState(false)
  const [bills, setBills] = useState(() => { try { const saved = JSON.parse(localStorage.getItem('ethio-bills')); return (saved || starterBills).map(normalizeBillRecord) } catch { return starterBills } })
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingBillId, setEditingBillId] = useState(null)
  const [formError, setFormError] = useState('')
  const [statusMessage, setStatusMessage] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState('Bills')
  const [copiedAccountId, setCopiedAccountId] = useState(null)
  const [notificationPermission, setNotificationPermission] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'))

  const trial = useMemo(() => getTrialState(customer), [customer])
  const editingBill = useMemo(() => bills.find((bill) => bill.id === editingBillId) || null, [bills, editingBillId])
  const visibleBills = useMemo(() => bills.filter((bill) => `${bill.name} ${bill.recurringPeriod} ${bill.paymentName} ${bill.paymentNumber}`.toLowerCase().includes(query.toLowerCase())), [bills, query])
  const dueTotal = bills.filter((bill) => !bill.paid).reduce((total, bill) => total + bill.amount, 0)

  useEffect(() => { if (!statusMessage) return undefined; const timer = setTimeout(() => setStatusMessage(null), 2200); return () => clearTimeout(timer) }, [statusMessage])
  useEffect(() => localStorage.setItem('ethio-bills', JSON.stringify(bills)), [bills])

  useEffect(() => {
    if (notificationPermission !== 'granted') return undefined
    const checkReminderQueue = () => {
      bills.forEach((bill) => {
        const reminderType = getReminderState(bill)
        if (!reminderType || !reminderTypes.includes(reminderType)) return
        const key = `notified-${bill.id}-${reminderType}-${bill.due}`
        if (localStorage.getItem(key)) return
        new Notification(`${bill.name} reminder`, { body: `${reminderType} · ${bill.paymentName} · ${currency.format(bill.amount)} ETB`, tag: key })
        localStorage.setItem(key, 'true')
      })
    }
    checkReminderQueue()
    const interval = setInterval(checkReminderQueue, 60_000)
    return () => clearInterval(interval)
  }, [bills, notificationPermission])

  function registerCustomer(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const name = String(form.get('userName') || '').trim()
    const phone = String(form.get('phone') || '').replace(/\s+/g, '')
    const error = validateRegistration(name, phone)
    if (error) { setFormError(error); return }
    const now = new Date()
    const record = { name, phone, registeredAt: now.toISOString(), trialEndsAt: new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString(), subscriptionActive: false }
    localStorage.setItem('ethio-customer', JSON.stringify(record))
    setCustomer(record)
    setShowRegistration(false)
    setFormError('')
    setStatusMessage({ type: 'success', text: 'Registration complete. Your 60-day free trial has started.' })
  }

  function activateSubscriptionPlaceholder() {
    const updated = { ...customer, subscriptionActive: true, subscriptionPrice: MONTHLY_PRICE, subscriptionActivatedAt: new Date().toISOString(), paymentApiEnabled: false }
    localStorage.setItem('ethio-customer', JSON.stringify(updated))
    setCustomer(updated)
    setShowSubscription(false)
    setStatusMessage({ type: 'success', text: 'Subscription status updated to active. Payment API is not connected.' })
  }

  async function copyAccount(id, accountNumber) {
    await navigator.clipboard.writeText(accountNumber || '')
    setCopiedAccountId(id)
    setTimeout(() => setCopiedAccountId(null), 1600)
  }

  async function enableNotifications() {
    const result = await enablePushNotifications()
    if (result.status === 'enabled') { setNotificationPermission('granted'); localStorage.setItem('fcm-token', result.token) }
    if (result.status === 'denied') setNotificationPermission('denied')
  }

  function togglePaid(id) { setBills((current) => current.map((bill) => bill.id === id ? { ...bill, paid: !bill.paid } : bill)) }
  function openNewBillModal() { setEditingBillId(null); setFormError(''); setIsModalOpen(true) }
  function openEditBillModal(bill) { setEditingBillId(bill.id); setFormError(''); setIsModalOpen(true) }
  function closeBillModal() { setIsModalOpen(false); setEditingBillId(null); setFormError('') }

  function saveBill(event) {
    event.preventDefault()
    setIsSubmitting(true)
    const form = new FormData(event.currentTarget)
    const payload = { name: form.get('name'), recurringPeriod: form.get('recurringPeriod'), amount: form.get('amount'), dueDay: form.get('dueDay'), dueMonth: form.get('dueMonth'), paymentName: form.get('paymentName'), paymentNumber: form.get('paymentNumber') }
    if (!String(payload.name).trim() || !String(payload.paymentName).trim() || !Number(payload.amount) || !ethiopianDays.includes(Number(payload.dueDay))) {
      setFormError('Complete all required bill fields with valid values.')
      setIsSubmitting(false)
      return
    }
    const nextBill = { id: editingBillId ?? Date.now(), name: String(payload.name).trim(), recurringPeriod: String(payload.recurringPeriod || 'Monthly'), amount: Number(payload.amount), due: `${payload.dueDay} ${payload.dueMonth}`, paymentName: String(payload.paymentName).trim(), paymentNumber: String(payload.paymentNumber || '').trim(), color: editingBill?.color || 'mint', icon: editingBill?.icon || '＋', paid: editingBill?.paid || false }
    setBills((current) => editingBillId ? current.map((bill) => bill.id === editingBillId ? nextBill : bill) : [...current, nextBill])
    setStatusMessage({ type: 'success', text: editingBillId ? 'Bill saved.' : 'Bill added.' })
    setIsSubmitting(false)
    closeBillModal()
  }

  function deleteBill(id) { setBills((current) => current.filter((bill) => bill.id !== id)); setStatusMessage({ type: 'success', text: 'Bill deleted.' }) }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">✦</span><span>Ethio Bill</span></div>
        <div className="top-actions">
          <button className="notification-button" type="button" onClick={enableNotifications} aria-label="Enable notifications">🔔</button>
          {customer && <button className="profile-button" type="button" onClick={() => setShowSubscription(true)}><span>{customer.name}</span></button>}
        </div>
      </header>

      {customer && (
        <div className={`trial-banner ${trial.status}`}>
          {trial.status === 'trial' && <span><strong>Free trial</strong> · {trial.daysLeft} day{trial.daysLeft === 1 ? '' : 's'} remaining</span>}
          {trial.status === 'subscribed' && <span><strong>Subscribed</strong> · {MONTHLY_PRICE} ETB/month</span>}
          {trial.status === 'expired' && <span><strong>Trial expired</strong> · Subscribe for {MONTHLY_PRICE} ETB/month</span>}
          {trial.status !== 'subscribed' && <button type="button" onClick={() => setShowSubscription(true)}>View plan</button>}
        </div>
      )}

      <main className="content-wrap">
        <section className="welcome"><div><p className="eyebrow">ETHIO BILL</p><h1>Good morning{customer ? `, ${customer.name}` : ''} <span>☀</span></h1><p className="subhead">Your bills, kept simple.</p></div><button className="primary-button" type="button" onClick={openNewBillModal}>＋ Add bill</button></section>
        <section className="summary"><div><p>To pay this month</p><strong>{currency.format(dueTotal)} <small>ETB</small></strong></div><div className="summary-count"><strong>{bills.filter((bill) => !bill.paid).length}</strong><span>Pending</span></div></section>
        {statusMessage && <div className={`status-banner ${statusMessage.type}`}>{statusMessage.text}</div>}
        <div className="list-heading"><div><h2>{activeTab === 'Bills' ? 'Upcoming bills' : 'Paid bills'}</h2><p>Choose the account you will use to pay.</p></div><label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search bills" /></label></div>
        <section className="bills-list">
          {visibleBills.filter((bill) => activeTab === 'Bills' ? !bill.paid : bill.paid).map((bill) => (
            <article className="bill-card" key={bill.id}><div className={`bill-icon ${bill.color}`}>{bill.icon}</div><div className="bill-info"><div className="bill-title"><h3>{bill.name}</h3><strong>{currency.format(bill.amount)} <small>ETB</small></strong></div><p>{bill.recurringPeriod}</p><div className="bill-meta"><span>Due · {bill.due}</span><span className={`status ${bill.paid ? 'paid' : 'due'}`}>{bill.paid ? 'Paid' : 'Due'}</span></div><div className="account"><strong>{bill.paymentName}</strong>{bill.paymentNumber && <em>{bill.paymentNumber}</em>}<button type="button" className="account-copy" onClick={() => copyAccount(bill.id, bill.paymentNumber)}>{copiedAccountId === bill.id ? 'Copied' : 'Copy'}</button></div><div className="bill-actions"><button type="button" onClick={() => togglePaid(bill.id)}>{bill.paid ? 'Mark due' : 'Mark paid'}</button><button type="button" onClick={() => openEditBillModal(bill)}>Edit</button><button type="button" onClick={() => deleteBill(bill.id)}>Delete</button></div></div></article>
          ))}
        </section>
      </main>

      <nav className="bottom-nav"><button className={activeTab === 'Bills' ? 'selected' : ''} type="button" onClick={() => setActiveTab('Bills')}><span>▤</span>Bills</button><button type="button" onClick={openNewBillModal}><span>＋</span>Add</button><button className={activeTab === 'Paid' ? 'selected' : ''} type="button" onClick={() => setActiveTab('Paid')}><span>✓</span>Paid</button></nav>

      {showRegistration && <div className="modal-backdrop"><form className="modal registration-modal" onSubmit={registerCustomer}><div className="modal-head"><div><p className="eyebrow">WELCOME</p><h2>Create customer account</h2></div></div>{formError && <p className="form-error">{formError}</p>}<label>User name<input name="userName" placeholder="Enter your name" autoComplete="name" /></label><label>Phone number<input name="phone" type="tel" placeholder="0911 234 567" autoComplete="tel" /></label><div className="trial-card"><strong>60 days free</strong><span>No payment required during the trial.</span></div><button className="modal-submit" type="submit">Start free trial</button></form></div>}

      {showSubscription && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setShowSubscription(false)}><div className="modal subscription-modal"><div className="modal-head"><div><p className="eyebrow">SUBSCRIPTION</p><h2>Ethio Bill plan</h2></div><button className="close-button" type="button" onClick={() => setShowSubscription(false)}>×</button></div><div className="subscription-price"><strong>{MONTHLY_PRICE}</strong><span>ETB / month</span></div><p>{trial.status === 'expired' ? 'Your 60-day free trial has ended.' : 'Payment API integration is not connected yet.'}</p>{trial.status === 'subscribed' ? <button className="modal-submit" type="button" onClick={() => setShowSubscription(false)}>Current plan</button> : <button className="modal-submit" type="button" onClick={activateSubscriptionPlaceholder}>Activate 30 ETB status</button>}</div></div>}

      {isModalOpen && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeBillModal()}><form className="modal" onSubmit={saveBill}><div className="modal-head"><div><p className="eyebrow">BILL DETAILS</p><h2>{editingBill ? 'Edit bill' : 'Add bill'}</h2></div><button className="close-button" type="button" onClick={closeBillModal}>×</button></div>{formError && <p className="form-error">{formError}</p>}<label>Bill name<input name="name" defaultValue={editingBill?.name || ''} placeholder="Electricity" /></label><div className="form-row"><label>Amount (ETB)<input name="amount" type="number" min="1" defaultValue={editingBill?.amount || ''} /></label><label>Repeat<select name="recurringPeriod" defaultValue={editingBill?.recurringPeriod || 'Monthly'}><option>Monthly</option><option>Weekly</option><option>Daily</option></select></label></div><div className="form-row"><label>Due day<select name="dueDay" defaultValue={editingBill?.due?.split(' ')[0] || ''}><option value="">Select</option>{ethiopianDays.map((day) => <option key={day} value={day}>{day}</option>)}</select></label><label>Due month<select name="dueMonth" defaultValue={editingBill?.due?.split(' ')[1] || ''}><option value="">Select</option>{ethiopianMonths.map((month) => <option key={month}>{month}</option>)}</select></label></div><label>Bank or wallet<input name="paymentName" defaultValue={editingBill?.paymentName || ''} placeholder="CBE Birr" /></label><label>Account number <span>(optional)</span><input name="paymentNumber" defaultValue={editingBill?.paymentNumber || ''} placeholder="0911 234 567" /></label><button className="modal-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save bill'}</button></form></div>}
    </div>
  )
}

export default App
