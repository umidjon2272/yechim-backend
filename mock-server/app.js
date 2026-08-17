/**
 * ZENIX CRM — mock backend Express app.
 *
 * FOR LOCAL DEVELOPMENT/DEMO ONLY. Not production code: data lives in
 * memory and resets every restart (or every cold start, when running as a
 * Vercel serverless function — see /api/index.js), and validation is minimal.
 * Demo passwords are still stored as salted hashes so the auth flow mirrors
 * the real backend contract. It exists purely so the real frontend
 * (which talks to real REST endpoints) has something to talk to before the
 * real backend is built. Endpoints mirror src/api/endpoints.js exactly.
 *
 * This file only builds and exports the Express `app` — it does not call
 * `app.listen()`, so the same app can be used both by `server.js` (local
 * `node server.js`) and by `/api/index.js` (Vercel serverless function).
 */
const express = require('express')
const cookieParser = require('cookie-parser')
const multer = require('multer')
const crypto = require('crypto')

const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })

app.use(express.json())
app.use(cookieParser())

// ---------------------------------------------------------------------------
// In-memory data
// ---------------------------------------------------------------------------
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']
const PASSWORD_ITERATIONS = 120000

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(String(password), salt, PASSWORD_ITERATIONS, 32, 'sha256').toString('hex')
  return `pbkdf2$${PASSWORD_ITERATIONS}$${salt}$${hash}`
}

function verifyPassword(password, stored) {
  if (!stored) return false
  if (!String(stored).startsWith('pbkdf2$')) return String(password) === String(stored)
  const [, iterations, salt, expected] = String(stored).split('$')
  const actual = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, 'sha256').toString('hex')
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

function isAdmin(user) {
  return ADMIN_ROLES.includes(user?.role)
}

function hasPermission(user, permission) {
  if (!user) return false
  if (isAdmin(user)) return true
  return Array.isArray(user.permissions) && user.permissions.includes(permission)
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
      return res.status(403).json({ message: 'Bu amal uchun ruxsat yo‘q' })
    }
    next()
  }
}

function normalizeUserPayload(payload, { existingUser, allowPassword = false } = {}) {
  const { password, confirmPassword, currentPassword, newPassword, ...rest } = payload || {}
  const next = { ...rest }
  if ((next.firstName || next.lastName) && !next.name) {
    next.name = `${next.firstName || ''} ${next.lastName || ''}`.trim()
  }
  delete next.confirmPassword
  delete next.currentPassword
  delete next.newPassword
  if (next.teamId) {
    const team = db.teams.find((t) => t.id === next.teamId)
    next.team = team ? { id: team.id, name: team.name } : null
  }
  if (allowPassword && password) next.password = hashPassword(password)
  if (existingUser && next.email && db.users.some((u) => u.id !== existingUser.id && u.email === next.email)) {
    throw new Error('Bu email allaqachon mavjud')
  }
  if (existingUser && next.username && db.users.some((u) => u.id !== existingUser.id && u.username === next.username)) {
    throw new Error('Bu login allaqachon mavjud')
  }
  return next
}

const db = {
  sessions: new Map(), // sid -> userId
  users: [],
  teams: [],
  customers: [],
  customerStages: [],
  customerGroups: [],
  businesses: [],
  leads: [],
  deals: [],
  dealItems: [],
  quotations: [],
  payments: [],
  tasks: [],
  activities: [],
  installations: [],
  comments: [],
  attachments: [],
  attachmentFiles: new Map(), // id -> Buffer
  notifications: [],
}

const DEFAULT_CUSTOMER_STAGES = [
  { id: 'NEW', label: 'Yangi' },
  { id: 'CONTACTED', label: 'Gaplashilgan' },
  { id: 'IN_PROGRESS', label: 'Jarayonda' },
  { id: 'FOLLOW_UP', label: 'Qayta aloqaga chiqish' },
  { id: 'FUTURE_SALE', label: 'Keyinchalik sotuv' },
  { id: 'DEPOSIT_RECEIVED', label: 'Zaklad olingan' },
  { id: 'PAID', label: 'To‘lov qilindi' },
  { id: 'INSTALLATION_REQUIRED', label: 'O‘rnatish kerak' },
  { id: 'INSTALLED', label: 'O‘rnatib bo‘ldi' },
]

const LEGACY_CUSTOMER_STAGE_MAP = {
  ORDERED: 'DEPOSIT_RECEIVED',
  PAYMENT_PENDING: 'DEPOSIT_RECEIVED',
  INSTALLING: 'INSTALLATION_REQUIRED',
  DONE: 'INSTALLED',
}

function defaultCustomerStageId() {
  return db.customerStages.find((item) => item.label === 'Yangi')?.id || 'NEW'
}

function normalizeCustomerStage(stage) {
  const fallback = defaultCustomerStageId()
  const mapped = LEGACY_CUSTOMER_STAGE_MAP[stage] || stage || fallback
  return db.customerStages.some((item) => item.id === mapped) ? mapped : fallback
}

function normalizeCustomerAmount(amount) {
  if (amount === '' || amount == null) return 0
  const numeric = Number(amount)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0
}

function normalizeCustomerRecord(customer) {
  customer.stage = normalizeCustomerStage(customer.stage)
  customer.amount = normalizeCustomerAmount(customer.amount)
  customer.programs = Array.isArray(customer.programs)
    ? customer.programs.map((program) => ({
        id: program.id || uid(),
        version: '',
        startDate: '',
        installedDate: '',
        status: 'NEW',
        subscriptionUntil: '',
        notes: '',
        createdAt: program.createdAt || now(),
        ...program,
      }))
    : []
  customer.groupIds = Array.isArray(customer.groupIds) ? customer.groupIds : []
  return customer
}

function seed() {
  db.customerStages.push(...DEFAULT_CUSTOMER_STAGES.map((stage, order) => ({ ...stage, order, system: true, createdAt: now() })))

  const teamSales = { id: uid(), name: 'Sales', description: 'Sotuv bo‘limi', lead: null, status: 'active', membersCount: 2 }
  const teamInstall = { id: uid(), name: 'Installation', description: 'O‘rnatish bo‘limi', lead: null, status: 'active', membersCount: 1 }
  db.teams.push(teamSales, teamInstall)

  const admin = {
    id: uid(),
    name: 'Admin Zenix',
    email: 'admin@zenix.com',
    username: 'admin',
    password: hashPassword('admin123'),
    phone: '+998901234567',
    role: 'SUPER_ADMIN',
    permissions: [],
    team: teamSales,
    status: 'active',
    createdAt: now(),
  }
  const sales = {
    id: uid(),
    name: 'Sardor Aliyev',
    email: 'sardor@zenix.com',
    username: 'sardor.sales',
    password: hashPassword('sardor123'),
    phone: '+998901112233',
    role: 'SALES',
    permissions: [
      'customers.view', 'customers.create', 'customers.edit',
      'customer-groups.view', 'customer-groups.create', 'customer-groups.edit',
      'businesses.view', 'businesses.create', 'businesses.edit',
      'leads.view', 'leads.create', 'leads.edit',
      'deals.view', 'deals.create', 'deals.edit',
      'quotations.view', 'quotations.create', 'quotations.edit',
      'payments.view', 'payments.create',
      'tasks.view',
      'activities.view', 'activities.create',
      'installations.view',
      'attachments.create', 'comments.create',
    ],
    team: teamSales,
    status: 'active',
    createdAt: now(),
  }
  const installer = {
    id: uid(),
    name: 'Javohir Karimov',
    email: 'javohir@zenix.com',
    username: 'javohir.install',
    password: hashPassword('javohir123'),
    phone: '+998903334455',
    role: 'INSTALLER',
    permissions: ['installations.view', 'installations.edit', 'tasks.view', 'activities.view', 'activities.create', 'comments.create'],
    team: teamInstall,
    status: 'active',
    createdAt: now(),
  }
  db.users.push(admin, sales, installer)
  teamSales.lead = { id: sales.id, name: sales.name }
  teamInstall.lead = { id: installer.id, name: installer.name }

  const customer1 = {
    id: uid(),
    name: 'Ali Valiyev',
    phone: '+998901234500',
    email: 'ali@example.com',
    assignedEmployee: { id: sales.id, name: sales.name },
    amount: 4500000,
    status: 'active',
    stage: 'DEPOSIT_RECEIVED',
    programs: [{ id: uid(), name: 'Bito POS', status: 'ACTIVE', createdAt: now() }],
    createdAt: now(),
  }
  const customer2 = {
    id: uid(),
    name: 'Malika Rustamova',
    phone: '+998907654321',
    email: 'malika@example.com',
    assignedEmployee: { id: sales.id, name: sales.name },
    amount: 0,
    status: 'active',
    stage: 'NEW',
    programs: [{ id: uid(), name: 'Bito Kassa', status: 'NEW', createdAt: now() }],
    createdAt: now(),
  }
  db.customers.push(customer1, customer2)
  db.customerGroups.push(
    { id: uid(), name: 'VIP mijozlar', createdAt: now(), status: 'active' },
    { id: uid(), name: 'Bito mijozlari', createdAt: now(), status: 'active' }
  )
  customer1.groupIds = [db.customerGroups[0].id, db.customerGroups[1].id]
  customer2.groupIds = [db.customerGroups[1].id]

  const business1 = {
    id: uid(),
    name: 'Ali Restaurant',
    businessType: 'Restoran',
    customer: { id: customer1.id, name: customer1.name },
    phone: '+998901234500',
    email: 'ali@example.com',
    address: 'Amir Temur ko‘chasi 12',
    city: 'Toshkent',
    status: 'active',
    assignedEmployee: { id: sales.id, name: sales.name },
    notes: 'VIP mijoz',
    createdAt: now(),
  }
  db.businesses.push(business1)
  customer1.business = { id: business1.id, name: business1.name }

  const lead1 = {
    id: uid(),
    title: 'POS tizimi uchun qiziqish',
    customer: { id: customer1.id, name: customer1.name },
    business: { id: business1.id, name: business1.name },
    source: 'INSTAGRAM',
    assignedEmployee: { id: sales.id, name: sales.name },
    interestLevel: 'HIGH',
    need: 'Restoran uchun zamonaviy POS kerak',
    interestedProduct: 'POS terminal',
    status: 'QUOTATION',
    expectedValue: 4500000,
    nextFollowUpDate: null,
    notes: '',
    dealId: null,
    createdAt: now(),
  }
  const lead2 = {
    id: uid(),
    title: 'Kassa apparati so‘rovi',
    customer: { id: customer2.id, name: customer2.name },
    business: null,
    source: 'TELEGRAM',
    assignedEmployee: { id: sales.id, name: sales.name },
    interestLevel: 'MEDIUM',
    need: 'Kichik do‘kon uchun kassa',
    interestedProduct: 'Kassa apparati',
    status: 'NEW',
    expectedValue: 1200000,
    nextFollowUpDate: null,
    notes: '',
    dealId: null,
    createdAt: now(),
  }
  db.leads.push(lead1, lead2)

  const deal1 = {
    id: uid(),
    name: 'Ali Restaurant — POS o‘rnatish',
    customer: { id: customer1.id, name: customer1.name },
    business: { id: business1.id, name: business1.name },
    salesEmployee: { id: sales.id, name: sales.name },
    stage: 'QUOTATION',
    value: 4500000,
    paymentStatus: 'PARTIAL',
    installationStatus: 'PENDING',
    expectedCloseDate: null,
    createdAt: now(),
  }
  db.deals.push(deal1)
  lead1.dealId = deal1.id

  const item1 = { id: uid(), dealId: deal1.id, product: 'POS terminal (Android)', quantity: 2, unitPrice: 2000000, discount: 100000, total: 3900000, createdAt: now() }
  const item2 = { id: uid(), dealId: deal1.id, product: 'Termal printer', quantity: 2, unitPrice: 300000, discount: 0, total: 600000, createdAt: now() }
  db.dealItems.push(item1, item2)

  const quotation1 = {
    id: uid(),
    number: '2026-0001',
    dealId: deal1.id,
    deal: { id: deal1.id, name: deal1.name },
    customer: { id: customer1.id, name: customer1.name, phone: customer1.phone, email: customer1.email },
    business: { id: business1.id, name: business1.name, address: business1.address },
    total: 4500000,
    status: 'SENT',
    validUntil: null,
    notes: 'Yetkazib berish narxga kirmagan',
    createdAt: now(),
  }
  db.quotations.push(quotation1)

  db.payments.push({
    id: uid(),
    dealId: deal1.id,
    deal: { id: deal1.id, name: deal1.name },
    customer: { id: customer1.id, name: customer1.name },
    business: { id: business1.id, name: business1.name },
    amount: 2000000,
    method: 'CASH',
    status: 'PAID',
    date: now().slice(0, 10),
    employee: { id: sales.id, name: sales.name },
    createdAt: now(),
  })

  db.tasks.push({
    id: uid(),
    title: 'Ali bilan quotation bo‘yicha bog‘lanish',
    description: 'Taklifnoma yuborilgan, javob kutilmoqda',
    assignedEmployee: { id: sales.id, name: sales.name },
    assignedEmployeeId: sales.id,
    customer: { id: customer1.id, name: customer1.name },
    deal: { id: deal1.id, name: deal1.name },
    dueDate: null,
    priority: 'HIGH',
    status: 'TODO',
    createdAt: now(),
  })

  db.activities.push({
    id: uid(),
    type: 'CALL',
    title: 'Birinchi qo‘ng‘iroq',
    description: 'Ehtiyojlar aniqlandi',
    employeeName: sales.name,
    customerId: customer1.id,
    businessId: business1.id,
    leadId: lead1.id,
    dealId: null,
    date: now(),
    duration: 12,
    result: 'Qiziqish yuqori',
    nextAction: 'Demo ko‘rsatish',
    createdAt: now(),
  })
  db.activities.push({
    id: uid(),
    type: 'DEMO',
    title: 'POS demo',
    description: 'Mahsulot imkoniyatlari ko‘rsatildi',
    employeeName: sales.name,
    customerId: customer1.id,
    businessId: business1.id,
    leadId: lead1.id,
    dealId: deal1.id,
    date: now(),
    duration: 30,
    result: 'Mijoz mamnun',
    nextAction: 'Quotation yuborish',
    createdAt: now(),
  })

  db.installations.push({
    id: uid(),
    dealId: deal1.id,
    deal: { id: deal1.id, name: deal1.name },
    dealItemId: item1.id,
    dealItem: { id: item1.id, product: item1.product },
    customer: { id: customer1.id, name: customer1.name },
    business: { id: business1.id, name: business1.name },
    assignedEmployee: { id: installer.id, name: installer.name },
    address: business1.address,
    scheduledDate: null,
    startedDate: null,
    completedDate: null,
    status: 'SCHEDULED',
    notes: '',
    createdAt: now(),
  })

  db.notifications.push({
    id: uid(),
    title: 'New task assigned',
    message: '"Ali bilan quotation bo‘yicha bog‘lanish" sizga biriktirildi',
    type: 'task',
    read: false,
    relatedEntityType: 'task',
    relatedEntityId: null,
    createdAt: now(),
  })
  db.notifications.push({
    id: uid(),
    title: 'Deal moved to Quotation',
    message: `"${deal1.name}" Quotation bosqichiga o‘tdi`,
    type: 'deal',
    read: false,
    relatedEntityType: 'deal',
    relatedEntityId: deal1.id,
    createdAt: now(),
  })
}
seed()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function publicUser(user) {
  const { password, ...rest } = user
  return rest
}

function requireAuth(req, res, next) {
  const sid = req.cookies.sid
  const userId = sid && db.sessions.get(sid)
  const user = db.users.find((u) => u.id === userId)
  if (!user) return res.status(401).json({ message: 'Sessiya topilmadi. Iltimos qayta kiring.' })
  req.user = user
  next()
}

function paginate(list, query, { searchFields = [], relationFields = [], filterFn, extraSearchText, enrichFn } = {}) {
  let result = [...list]

  relationFields.forEach((field) => {
    if (query[field]) result = result.filter((item) => String(resolveRelationId(item, field)) === String(query[field]))
  })

  if (query.status) result = result.filter((item) => item.status === query.status)
  if (query.source) result = result.filter((item) => item.source === query.source)
  if (query.method) result = result.filter((item) => item.method === query.method)
  if (query.type) result = result.filter((item) => item.type === query.type)
  if (query.stage) result = result.filter((item) => item.stage === query.stage)
  if (query.priority) result = result.filter((item) => item.priority === query.priority)
  if (filterFn) result = result.filter((item) => filterFn(item, query))

  if (query.search) {
    const term = String(query.search).toLowerCase()
    result = result.filter((item) => {
      const directMatch = searchFields.some((field) => String(item[field] || '').toLowerCase().includes(term))
      const extraMatch = extraSearchText ? String(extraSearchText(item) || '').toLowerCase().includes(term) : false
      return directMatch || extraMatch
    })
  }

  if (query.assignedToMe === 'true' && query.__currentUserId) {
    result = result.filter((item) => resolveAssignedEmployeeId(item) === query.__currentUserId)
  }

  if (query.sort) {
    const desc = query.sort.startsWith('-')
    const field = desc ? query.sort.slice(1) : query.sort
    result.sort((a, b) => {
      const av = a[field] ?? ''
      const bv = b[field] ?? ''
      if (av < bv) return desc ? 1 : -1
      if (av > bv) return desc ? -1 : 1
      return 0
    })
  }

  const total = result.length
  const page = Number(query.page) || 1
  const pageSize = Number(query.pageSize) || 20
  const items = result.slice((page - 1) * pageSize, page * pageSize).map((item) => (enrichFn ? enrichFn(item) : item))
  return { items, total, page, pageSize }
}

function resolveRelationId(item, field) {
  if (field === 'customerId') return item.customer?.id ?? item.customerId
  if (field === 'businessId') return item.business?.id ?? item.businessId
  if (field === 'dealId') return item.deal?.id ?? item.dealId
  if (field === 'leadId') return item.lead?.id ?? item.leadId
  if (field === 'installationId') return item.installation?.id ?? item.installationId
  if (field === 'salesEmployeeId' || field === 'assignedEmployeeId') return resolveAssignedEmployeeId(item)
  return item[field]
}

// "Assigned employee" is stored under different field names/shapes per
// resource (Tasks: flat assignedEmployeeId, Leads/Installations: nested
// assignedEmployee.id, Deals: nested salesEmployee.id) — this normalizes
// all of them for `assignedToMe` filtering and the Deals/Installations
// employee filter.
function resolveAssignedEmployeeId(item) {
  return item.assignedEmployeeId ?? item.assignedEmployee?.id ?? item.salesEmployee?.id ?? null
}

// The frontend creates records by sending flat *Id fields (customerId,
// businessId, dealId, assignedEmployeeId, ...) — this resolves each one to
// the nested {id, name} display object every list/detail page expects
// (row.customer?.name, row.deal?.name, etc), so newly-created records show
// real names immediately instead of only after a full reload.
function enrichReferences(item) {
  if (item.customerId && !item.customer) {
    const c = db.customers.find((x) => x.id === item.customerId)
    if (c) item.customer = { id: c.id, name: c.name }
  }
  if (item.businessId && !item.business) {
    const b = db.businesses.find((x) => x.id === item.businessId)
    if (b) item.business = { id: b.id, name: b.name }
  }
  if (item.dealId && !item.deal) {
    const d = db.deals.find((x) => x.id === item.dealId)
    // Includes the deal's own customer/business so consumers that fall back
    // to `item.deal?.customer` (e.g. an Installation with no customerId of
    // its own) still resolve a name instead of showing "—".
    if (d) item.deal = { id: d.id, name: d.name, customer: d.customer, business: d.business }
  }
  if (item.leadId && !item.lead) {
    const l = db.leads.find((x) => x.id === item.leadId)
    if (l) item.lead = { id: l.id, title: l.title }
  }
  if (item.dealItemId && !item.dealItem) {
    const di = db.dealItems.find((x) => x.id === item.dealItemId)
    if (di) item.dealItem = { id: di.id, product: di.product }
  }
  if (item.assignedEmployeeId && !item.assignedEmployee) {
    const e = db.users.find((x) => x.id === item.assignedEmployeeId)
    if (e) item.assignedEmployee = { id: e.id, name: e.name }
  }
  if (item.salesEmployeeId && !item.salesEmployee) {
    const e = db.users.find((x) => x.id === item.salesEmployeeId)
    if (e) item.salesEmployee = { id: e.id, name: e.name }
  }
  return item
}

function findOr404(res, list, id, label) {
  const item = list.find((x) => x.id === id)
  if (!item) {
    res.status(404).json({ message: `${label} topilmadi` })
    return null
  }
  return item
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  const login = String(email || '').trim()
  const user = db.users.find((u) => (u.email === login || u.username === login) && verifyPassword(password, u.password))
  if (!user) return res.status(401).json({ message: 'Email yoki parol noto‘g‘ri' })
  if (user.status === 'inactive') return res.status(403).json({ message: 'Bu xodim nofaol holatda' })

  const sid = uid()
  db.sessions.set(sid, user.id)
  res.cookie('sid', sid, { httpOnly: true, sameSite: 'lax', path: '/' })
  res.json(publicUser(user))
})

app.post('/api/auth/logout', (req, res) => {
  const sid = req.cookies.sid
  if (sid) db.sessions.delete(sid)
  res.clearCookie('sid', { path: '/' })
  res.json({ ok: true })
})

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(publicUser(req.user))
})

app.patch('/api/users/me', requireAuth, (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword, ...profile } = req.body || {}
    const next = normalizeUserPayload(profile, { existingUser: req.user })
    Object.assign(req.user, next)

    if (newPassword) {
      if (!currentPassword || !verifyPassword(currentPassword, req.user.password)) {
        return res.status(400).json({ message: 'Joriy parol noto‘g‘ri' })
      }
      if (String(newPassword).length < 6) {
        return res.status(400).json({ message: 'Yangi parol kamida 6 ta belgidan iborat bo‘lishi kerak' })
      }
      if (confirmPassword && newPassword !== confirmPassword) {
        return res.status(400).json({ message: 'Yangi parol tasdiqlanmadi' })
      }
      req.user.password = hashPassword(newPassword)
    }
    res.json(publicUser(req.user))
  } catch (err) {
    res.status(400).json({ message: err.message || 'Profilni yangilab bo‘lmadi' })
  }
})

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------
app.use('/api', requireAuth)

app.get('/api/employees', requirePermission('employees.view'), (req, res) =>
  res.json(paginate(db.users, req.query, {
    searchFields: ['name', 'email', 'username'],
    enrichFn: (user) => ({ ...publicUser(user), performance: employeePerformance(user.id) }),
  }))
)
app.get('/api/employees/:id', requirePermission('employees.view'), (req, res) => {
  const user = findOr404(res, db.users, req.params.id, 'Xodim')
  if (user) res.json({ ...publicUser(user), performance: employeePerformance(user.id) })
})
app.post('/api/employees', requirePermission('employees.create'), (req, res) => {
  try {
    const employee = {
      id: uid(),
      status: 'active',
      createdAt: now(),
      permissions: [],
      ...normalizeUserPayload(req.body, { allowPassword: true }),
    }
    if (!employee.password) employee.password = hashPassword('changeme123')
    if (db.users.some((u) => u.email === employee.email || (employee.username && u.username === employee.username))) {
      return res.status(400).json({ message: 'Bunday login yoki email mavjud' })
    }
    db.users.push(employee)
    res.status(201).json(publicUser(employee))
  } catch (err) {
    res.status(400).json({ message: err.message || 'Xodim yaratib bo‘lmadi' })
  }
})
app.patch('/api/employees/:id', requirePermission('employees.edit'), (req, res) => {
  const user = findOr404(res, db.users, req.params.id, 'Xodim')
  if (!user) return
  try {
    Object.assign(user, normalizeUserPayload(req.body, { existingUser: user, allowPassword: true }))
    res.json(publicUser(user))
  } catch (err) {
    res.status(400).json({ message: err.message || 'Xodimni yangilab bo‘lmadi' })
  }
})
app.post('/api/employees/:id/activate', requirePermission('employees.edit'), (req, res) => {
  const user = findOr404(res, db.users, req.params.id, 'Xodim')
  if (!user) return
  user.status = 'active'
  res.json(publicUser(user))
})
app.post('/api/employees/:id/deactivate', requirePermission('employees.edit'), (req, res) => {
  const user = findOr404(res, db.users, req.params.id, 'Xodim')
  if (!user) return
  user.status = 'inactive'
  res.json(publicUser(user))
})
app.get('/api/employees/:id/tasks', requirePermission('employees.view'), (req, res) => res.json(paginate(db.tasks.filter((t) => t.assignedEmployeeId === req.params.id), {})))
app.get('/api/employees/:id/leads', requirePermission('employees.view'), (req, res) => res.json(paginate(db.leads.filter((l) => l.assignedEmployee?.id === req.params.id), {})))
app.get('/api/employees/:id/deals', requirePermission('employees.view'), (req, res) => res.json(paginate(db.deals.filter((d) => d.salesEmployee?.id === req.params.id), {})))
app.get('/api/employees/:id/installations', requirePermission('employees.view'), (req, res) =>
  res.json(paginate(db.installations.filter((i) => i.assignedEmployee?.id === req.params.id), {}))
)

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------
app.get('/api/teams', requirePermission('employees.view'), (req, res) => res.json(paginate(db.teams, req.query, { searchFields: ['name'] })))
app.get('/api/teams/:id', requirePermission('employees.view'), (req, res) => {
  const team = findOr404(res, db.teams, req.params.id, 'Jamoa')
  if (team) res.json(team)
})
app.post('/api/teams', requirePermission('employees.edit'), (req, res) => {
  const team = { id: uid(), status: 'active', membersCount: 0, members: [], createdAt: now(), ...req.body }
  db.teams.push(team)
  res.status(201).json(team)
})
app.patch('/api/teams/:id', requirePermission('employees.edit'), (req, res) => {
  const team = findOr404(res, db.teams, req.params.id, 'Jamoa')
  if (!team) return
  Object.assign(team, req.body)
  res.json(team)
})
app.delete('/api/teams/:id', requirePermission('employees.edit'), (req, res) => {
  const index = db.teams.findIndex((t) => t.id === req.params.id)
  if (index === -1) return res.status(404).json({ message: 'Jamoa topilmadi' })
  db.teams.splice(index, 1)
  res.status(204).end()
})

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
const seededRoles = [
  { id: uid(), name: 'SUPER_ADMIN', permissions: [] },
  { id: uid(), name: 'SALES', permissions: db.users.find((u) => u.role === 'SALES')?.permissions ?? [] },
  { id: uid(), name: 'INSTALLER', permissions: db.users.find((u) => u.role === 'INSTALLER')?.permissions ?? [] },
]
app.get('/api/roles', requirePermission('settings.view'), (req, res) => res.json(paginate(seededRoles, req.query, { searchFields: ['name'] })))
app.get('/api/roles/permissions-schema', requirePermission('settings.view'), (req, res) => res.json([]))
app.get('/api/roles/:id', requirePermission('settings.view'), (req, res) => {
  const role = findOr404(res, seededRoles, req.params.id, 'Rol')
  if (role) res.json(role)
})

// ---------------------------------------------------------------------------
// Generic CRM resource factory
// ---------------------------------------------------------------------------
function registerResource(
  path,
  collection,
  { searchFields = ['name'], relationFields = [], skipCreate = false, defaultStatus = 'active', filterFn, extraSearchText, enrichFn } = {}
) {
  const resource = path
  app.get(`/api/${path}`, (req, res) => {
    if (!hasPermission(req.user, `${resource}.view`)) return res.status(403).json({ message: 'Bu bo‘lim uchun ruxsat yo‘q' })
    const query = { ...req.query, __currentUserId: req.user.id }
    if (path === 'tasks' && !hasPermission(req.user, 'tasks.viewAll')) query.assignedToMe = 'true'
    let list = collection
    if (path === 'customers' && !isAdmin(req.user)) {
      list = collection.filter((item) => resolveAssignedEmployeeId(item) === req.user.id)
    }
    res.json(paginate(list, query, { searchFields, relationFields, filterFn, extraSearchText, enrichFn }))
  })
  app.get(`/api/${path}/:id`, (req, res) => {
    if (!hasPermission(req.user, `${resource}.view`)) return res.status(403).json({ message: 'Bu bo‘lim uchun ruxsat yo‘q' })
    const item = findOr404(res, collection, req.params.id, path)
    if (item && path === 'customers' && !isAdmin(req.user) && resolveAssignedEmployeeId(item) !== req.user.id) {
      return res.status(403).json({ message: 'Bu mijoz uchun ruxsat yo‘q' })
    }
    if (item && path === 'tasks' && !hasPermission(req.user, 'tasks.viewAll') && resolveAssignedEmployeeId(item) !== req.user.id) {
      return res.status(403).json({ message: 'Bu vazifa uchun ruxsat yo‘q' })
    }
    if (item) res.json(item)
  })
  // skipCreate: true means a resource registers its own POST handler
  // elsewhere (quotations/payments/tasks/activities need bespoke defaults
  // like an auto-numbered `number` or `employeeName` from the session) —
  // Express only invokes the FIRST matching handler for a route, so this
  // generic one must not be registered at all for those, or it would
  // silently shadow the specialized one.
  if (!skipCreate) {
    app.post(`/api/${path}`, (req, res) => {
      if (!hasPermission(req.user, `${resource}.create`)) return res.status(403).json({ message: 'Qo‘shish uchun ruxsat yo‘q' })
      const customerDefaults = path === 'customers' ? { stage: defaultCustomerStageId(), amount: 0 } : {}
      const item = enrichReferences({ id: uid(), status: req.body.status || defaultStatus, ...customerDefaults, createdAt: now(), ...req.body })
      if (path === 'customers') normalizeCustomerRecord(item)
      collection.push(item)
      res.status(201).json(item)
    })
  }
  app.patch(`/api/${path}/:id`, (req, res) => {
    const item = findOr404(res, collection, req.params.id, path)
    if (!item) return
    if (path === 'tasks' && !hasPermission(req.user, 'tasks.edit')) {
      const allowedOwnStatus = resolveAssignedEmployeeId(item) === req.user.id && Object.keys(req.body || {}).every((key) => key === 'status')
      if (!allowedOwnStatus) return res.status(403).json({ message: 'Vazifani tahrirlash uchun ruxsat yo‘q' })
    } else if (!hasPermission(req.user, `${resource}.edit`)) {
      return res.status(403).json({ message: 'Tahrirlash uchun ruxsat yo‘q' })
    }
    if (path === 'customers' && !isAdmin(req.user) && resolveAssignedEmployeeId(item) !== req.user.id) {
      return res.status(403).json({ message: 'Bu mijoz uchun ruxsat yo‘q' })
    }
    Object.assign(item, req.body)
    enrichReferences(item)
    if (path === 'customers') normalizeCustomerRecord(item)
    res.json(item)
  })
}

function customerBusinesses(customerId) {
  return db.businesses.filter((b) => b.customer?.id === customerId)
}

function customerInstallations(customerId) {
  return db.installations.filter((installation) => installation.customer?.id === customerId)
}

function customerDeals(customerId) {
  return db.deals.filter((d) => d.customer?.id === customerId)
}

function customerDealAmount(customerId) {
  return customerDeals(customerId).reduce((sum, deal) => sum + Number(deal.value || 0), 0)
}

function employeePerformance(employeeId) {
  const customers = db.customers.filter((c) => c.assignedEmployee?.id === employeeId)
  const leads = db.leads.filter((l) => l.assignedEmployee?.id === employeeId)
  const deals = db.deals.filter((d) => d.salesEmployee?.id === employeeId)
  const wonDeals = deals.filter((d) => d.stage === 'WON')
  const revenue = customers.reduce((sum, customer) => sum + customerDealAmount(customer.id), 0)
  const tasksCompleted = db.tasks.filter((t) => t.assignedEmployeeId === employeeId && t.status === 'COMPLETED').length
  const tasksInProgress = db.tasks.filter((t) => t.assignedEmployeeId === employeeId && t.status === 'IN_PROGRESS').length
  const installationsCompleted = db.installations.filter((i) => i.assignedEmployee?.id === employeeId && i.status === 'COMPLETED').length
  const activeTasks = db.tasks.filter((t) => t.assignedEmployeeId === employeeId && !['COMPLETED', 'CANCELLED'].includes(t.status)).length
  const stageCounts = DEFAULT_CUSTOMER_STAGES.reduce((acc, stage) => ({ ...acc, [stage.id]: 0 }), {})
  customers.forEach((customer) => {
    const stage = normalizeCustomerStage(customer.stage)
    stageCounts[stage] = (stageCounts[stage] || 0) + 1
  })

  return {
    customers: customers.length,
    stageCounts,
    stageStats: DEFAULT_CUSTOMER_STAGES.map((stage) => ({ id: stage.id, label: stage.label, count: stageCounts[stage.id] || 0 })),
    leads: leads.length,
    deals: deals.length,
    wonDeals: wonDeals.length,
    revenue,
    tasksCompleted,
    tasksInProgress,
    activeTasks,
    installationsCompleted,
  }
}

function customerStageLabel(stageId) {
  return db.customerStages.find((stage) => stage.id === stageId)?.label || stageId || ''
}

function slugStageName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[‘'`]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
}

function makeCustomerStageId(name) {
  const base = slugStageName(name) || 'BOSQICH'
  let id = `CUSTOM_${base}`
  let suffix = 2
  while (db.customerStages.some((stage) => stage.id === id)) {
    id = `CUSTOM_${base}_${suffix}`
    suffix += 1
  }
  return id
}

function orderedCustomerStages() {
  return [...db.customerStages].sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
}

function reindexCustomerStages(stages = orderedCustomerStages()) {
  stages.forEach((stage, index) => {
    stage.order = index
  })
  db.customerStages = stages
}

app.get('/api/meta/customer-stages', (req, res) => {
  if (!hasPermission(req.user, 'customers.view')) return res.status(403).json({ message: 'CRM bosqichlarini ko‘rish uchun ruxsat yo‘q' })
  const items = orderedCustomerStages()
  res.json({ items, total: items.length })
})
app.post('/api/meta/customer-stages', (req, res) => {
  if (!hasPermission(req.user, 'customers.edit')) return res.status(403).json({ message: 'Bosqich yaratish uchun ruxsat yo‘q' })
  const label = String(req.body?.name || req.body?.label || '').trim()
  if (!label) return res.status(400).json({ message: 'Bosqich nomi kiritilishi shart' })
  if (db.customerStages.some((stage) => stage.label.toLowerCase() === label.toLowerCase())) {
    return res.status(400).json({ message: 'Bunday bosqich mavjud' })
  }
  const ordered = orderedCustomerStages()
  const afterIndex = req.body?.afterStageId ? ordered.findIndex((item) => item.id === req.body.afterStageId) : ordered.length - 1
  const insertIndex = afterIndex >= 0 ? afterIndex + 1 : ordered.length
  const stage = { id: makeCustomerStageId(label), label, order: insertIndex, system: false, createdAt: now() }
  ordered.splice(insertIndex, 0, stage)
  reindexCustomerStages(ordered)
  res.status(201).json(stage)
})
app.patch('/api/meta/customer-stages/:id', (req, res) => {
  if (!hasPermission(req.user, 'customers.edit')) return res.status(403).json({ message: 'Bosqichni tahrirlash uchun ruxsat yoq' })
  const stage = findOr404(res, db.customerStages, req.params.id, 'Bosqich')
  if (!stage) return
  const label = String(req.body?.name || req.body?.label || stage.label).trim()
  if (!label) return res.status(400).json({ message: 'Bosqich nomi kiritilishi shart' })
  if (db.customerStages.some((item) => item.id !== stage.id && item.label.toLowerCase() === label.toLowerCase())) {
    return res.status(400).json({ message: 'Bunday bosqich mavjud' })
  }
  stage.label = label

  const direction = req.body?.direction
  if (direction === 'left' || direction === 'right') {
    const orderedStages = orderedCustomerStages()
    const index = orderedStages.findIndex((item) => item.id === stage.id)
    const targetIndex = direction === 'left' ? index - 1 : index + 1
    if (index >= 0 && targetIndex >= 0 && targetIndex < orderedStages.length) {
      orderedStages.splice(index, 1)
      orderedStages.splice(targetIndex, 0, stage)
      reindexCustomerStages(orderedStages)
    }
  } else if (req.body?.order !== undefined) {
    const orderedStages = orderedCustomerStages().filter((item) => item.id !== stage.id)
    const targetIndex = Math.max(0, Math.min(Number(req.body.order) || 0, orderedStages.length))
    orderedStages.splice(targetIndex, 0, stage)
    reindexCustomerStages(orderedStages)
  }

  res.json(stage)
})
app.delete('/api/meta/customer-stages/:id', (req, res) => {
  if (!hasPermission(req.user, 'customers.edit')) return res.status(403).json({ message: 'Bosqichni ochirish uchun ruxsat yoq' })
  const index = db.customerStages.findIndex((stage) => stage.id === req.params.id)
  if (index === -1) return res.status(404).json({ message: 'Bosqich topilmadi' })
  if (db.customerStages.length <= 1) return res.status(400).json({ message: 'Kamida bitta bosqich qolishi kerak' })
  const affected = db.customers.filter((customer) => customer.stage === req.params.id)
  if (affected.length > 0) {
    const replacementStageId = req.body?.replacementStageId
    if (!replacementStageId || replacementStageId === req.params.id || !db.customerStages.some((stage) => stage.id === replacementStageId)) {
      return res.status(400).json({ message: 'Mijozlarni kochirish uchun boshqa bosqich tanlang', count: affected.length })
    }
    affected.forEach((customer) => {
      customer.stage = replacementStageId
    })
  }
  db.customerStages.splice(index, 1)
  reindexCustomerStages()
  res.status(204).end()
})
app.get('/api/meta/customer-options', (req, res) => {
  if (!hasPermission(req.user, 'customers.view')) return res.status(403).json({ message: 'Mijoz filterlarini ko‘rish uchun ruxsat yo‘q' })
  const stageCounts = {}
  const customers = isAdmin(req.user) ? db.customers : db.customers.filter((customer) => resolveAssignedEmployeeId(customer) === req.user.id)
  customers.forEach((customer) => {
    const stage = normalizeCustomerStage(customer.stage)
    stageCounts[stage] = (stageCounts[stage] || 0) + 1
  })
  res.json({
    cities: [...new Set(db.businesses.map((business) => business.city).filter(Boolean))].sort(),
    programs: [...new Set(db.customers.flatMap((customer) => (customer.programs || []).map((program) => program.name)))].sort(),
    stageCounts,
  })
})

registerResource('customers', db.customers, {
  searchFields: ['name', 'phone', 'email'],
  relationFields: ['assignedEmployeeId'],
  filterFn: (customer, query) => {
    if (query.city && !customerBusinesses(customer.id).some((business) => business.city === query.city)) return false
    if (query.program && !(customer.programs || []).some((program) => program.name === query.program)) return false
    if (query.groupId && !(customer.groupIds || []).includes(query.groupId)) return false
    if (query.installationStatus && !customerInstallations(customer.id).some((installation) => installation.status === query.installationStatus)) return false
    if (query.createdFrom && customer.createdAt < query.createdFrom) return false
    if (query.createdTo && customer.createdAt > `${query.createdTo}T23:59:59.999Z`) return false
    return true
  },
  extraSearchText: (customer) => [
    ...customerBusinesses(customer.id).map((business) => business.name),
    ...customerBusinesses(customer.id).map((business) => business.city),
    ...(customer.programs || []).map((program) => program.name),
    customerStageLabel(customer.stage),
  ].join(' '),
  enrichFn: (customer) => ({ ...customer, dealAmount: customerDealAmount(customer.id) }),
})
app.post('/api/customers/bulk-move', (req, res) => {
  if (!hasPermission(req.user, 'customers.edit')) return res.status(403).json({ message: 'Mijozlarni kochirish uchun ruxsat yoq' })
  const ids = Array.isArray(req.body?.customerIds) ? req.body.customerIds : []
  const stage = req.body?.stage ? normalizeCustomerStage(req.body.stage) : null
  const targetGroupId = req.body?.targetGroupId || ''
  const fromGroupId = req.body?.fromGroupId || ''
  if (targetGroupId && !db.customerGroups.some((group) => group.id === targetGroupId)) {
    return res.status(400).json({ message: 'Guruh topilmadi' })
  }
  const updated = []
  ids.forEach((id) => {
    const customer = db.customers.find((item) => item.id === id)
    if (!customer) return
    if (!isAdmin(req.user) && resolveAssignedEmployeeId(customer) !== req.user.id) return
    if (stage) customer.stage = stage
    const groupIds = new Set(customer.groupIds || [])
    if (fromGroupId && fromGroupId !== targetGroupId) groupIds.delete(fromGroupId)
    if (targetGroupId) groupIds.add(targetGroupId)
    customer.groupIds = [...groupIds]
    updated.push(customer)
  })
  res.json({ items: updated, total: updated.length })
})
app.patch('/api/customers/:id/stage', (req, res) => {
  if (!hasPermission(req.user, 'customers.edit')) return res.status(403).json({ message: 'Bosqichni o‘zgartirish uchun ruxsat yo‘q' })
  const customer = findOr404(res, db.customers, req.params.id, 'Mijoz')
  if (!customer) return
  if (!isAdmin(req.user) && resolveAssignedEmployeeId(customer) !== req.user.id) {
    return res.status(403).json({ message: 'Bu mijoz uchun ruxsat yo‘q' })
  }
  customer.stage = normalizeCustomerStage(req.body.stage)
  res.json(customer)
})
app.patch('/api/customers/:id/groups', (req, res) => {
  if (!hasPermission(req.user, 'customers.edit')) return res.status(403).json({ message: 'Guruhni yangilash uchun ruxsat yoq' })
  const customer = findOr404(res, db.customers, req.params.id, 'Mijoz')
  if (!customer) return
  customer.groupIds = Array.isArray(req.body.groupIds) ? req.body.groupIds.filter((id) => db.customerGroups.some((group) => group.id === id)) : customer.groupIds
  res.json(customer)
})
app.post('/api/customers/:id/deactivate', (req, res) => {
  if (!hasPermission(req.user, 'customers.edit')) return res.status(403).json({ message: 'Mijozni o‘zgartirish uchun ruxsat yo‘q' })
  const customer = findOr404(res, db.customers, req.params.id, 'Mijoz')
  if (!customer) return
  customer.status = customer.status === 'active' ? 'inactive' : 'active'
  res.json(customer)
})

registerResource('customer-groups', db.customerGroups, { searchFields: ['name'] })
app.delete('/api/customer-groups/:id', (req, res) => {
  if (!hasPermission(req.user, 'customer-groups.edit') && !hasPermission(req.user, 'customers.edit')) return res.status(403).json({ message: 'Guruhni ochirish uchun ruxsat yoq' })
  const index = db.customerGroups.findIndex((group) => group.id === req.params.id)
  if (index === -1) return res.status(404).json({ message: 'Guruh topilmadi' })
  db.customerGroups.splice(index, 1)
  db.customers.forEach((customer) => {
    if (customer.groupIds?.includes(req.params.id)) customer.groupIds = customer.groupIds.filter((id) => id !== req.params.id)
  })
  res.status(204).end()
})

registerResource('businesses', db.businesses, { searchFields: ['name', 'city'], relationFields: ['customerId'] })
app.get('/api/businesses/:id/products', (req, res) => {
  const items = db.dealItems.filter((item) => {
    const deal = db.deals.find((d) => d.id === item.dealId)
    return deal?.business?.id === req.params.id
  })
  res.json({ items, total: items.length })
})

registerResource('leads', db.leads, { searchFields: ['title'], relationFields: ['customerId', 'businessId'] })
app.delete('/api/leads/:id', (req, res) => {
  const index = db.leads.findIndex((l) => l.id === req.params.id)
  if (index === -1) return res.status(404).json({ message: 'Lead topilmadi' })
  db.leads.splice(index, 1)
  res.status(204).end()
})
app.post('/api/leads/:id/convert-to-deal', (req, res) => {
  const lead = findOr404(res, db.leads, req.params.id, 'Lead')
  if (!lead) return
  // Customer/business always come from the lead itself — the payload from
  // the Convert to Deal modal only supplies editable fields (name/value/
  // assigned employee/products note), never re-creates them.
  const { name, value, salesEmployeeId, productsNote } = req.body || {}
  const salesEmployee = salesEmployeeId ? db.users.find((u) => u.id === salesEmployeeId) : lead.assignedEmployee
  const deal = {
    id: uid(),
    name: name || lead.title,
    customer: lead.customer,
    business: lead.business,
    salesEmployee: salesEmployee ? { id: salesEmployee.id, name: salesEmployee.name } : lead.assignedEmployee,
    stage: 'NEW',
    value: value != null ? value : lead.expectedValue,
    productsNote: productsNote || lead.interestedProduct || '',
    paymentStatus: 'PENDING',
    installationStatus: 'PENDING',
    expectedCloseDate: null,
    createdAt: now(),
  }
  db.deals.push(deal)
  lead.dealId = deal.id
  lead.status = 'WON'
  res.status(201).json({ id: deal.id, dealId: deal.id })
})

registerResource('deals', db.deals, { searchFields: ['name'], relationFields: ['customerId', 'businessId', 'salesEmployeeId'] })
app.patch('/api/deals/:id/stage', (req, res) => {
  const deal = findOr404(res, db.deals, req.params.id, 'Deal')
  if (!deal) return
  deal.stage = req.body.stage
  res.json(deal)
})
app.get('/api/deals/:dealId/items', (req, res) => {
  const items = db.dealItems.filter((item) => item.dealId === req.params.dealId)
  res.json({ items, total: items.length })
})
app.post('/api/deals/:dealId/items', (req, res) => {
  const item = {
    id: uid(),
    dealId: req.params.dealId,
    createdAt: now(),
    ...req.body,
    total: Math.max(0, Number(req.body.quantity || 0) * Number(req.body.unitPrice || 0) - Number(req.body.discount || 0)),
  }
  db.dealItems.push(item)
  res.status(201).json(item)
})
app.patch('/api/deals/:dealId/items/:itemId', (req, res) => {
  const item = findOr404(res, db.dealItems, req.params.itemId, 'Mahsulot')
  if (!item) return
  Object.assign(item, req.body)
  item.total = Math.max(0, Number(item.quantity || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0))
  res.json(item)
})
app.delete('/api/deals/:dealId/items/:itemId', (req, res) => {
  const index = db.dealItems.findIndex((i) => i.id === req.params.itemId)
  if (index === -1) return res.status(404).json({ message: 'Mahsulot topilmadi' })
  db.dealItems.splice(index, 1)
  res.status(204).end()
})

registerResource('quotations', db.quotations, { searchFields: ['number'], relationFields: ['dealId'], skipCreate: true })
app.post('/api/quotations', (req, res) => {
  const deal = db.deals.find((d) => d.id === req.body.dealId)
  const quotation = {
    id: uid(),
    number: `2026-${String(db.quotations.length + 1).padStart(4, '0')}`,
    dealId: req.body.dealId,
    deal: deal ? { id: deal.id, name: deal.name } : null,
    customer: deal?.customer ?? null,
    business: deal?.business ?? null,
    total: deal?.value ?? 0,
    status: 'DRAFT',
    createdAt: now(),
    ...req.body,
  }
  db.quotations.push(quotation)
  res.status(201).json(quotation)
})
app.post('/api/quotations/:id/send', (req, res) => transitionQuotation(req, res, 'SENT'))
app.post('/api/quotations/:id/accept', (req, res) => transitionQuotation(req, res, 'ACCEPTED'))
app.post('/api/quotations/:id/reject', (req, res) => transitionQuotation(req, res, 'REJECTED'))
function transitionQuotation(req, res, status) {
  const quotation = findOr404(res, db.quotations, req.params.id, 'Taklifnoma')
  if (!quotation) return
  quotation.status = status
  res.json(quotation)
}

registerResource('payments', db.payments, { searchFields: [], relationFields: ['customerId', 'businessId', 'dealId'], skipCreate: true })
app.post('/api/payments', (req, res) => {
  const deal = db.deals.find((d) => d.id === req.body.dealId)
  const payment = {
    id: uid(),
    createdAt: now(),
    deal: deal ? { id: deal.id, name: deal.name } : null,
    customer: deal?.customer ?? null,
    business: deal?.business ?? null,
    employee: { id: req.user.id, name: req.user.name },
    ...req.body,
  }
  db.payments.push(payment)
  res.status(201).json(payment)
})

registerResource('tasks', db.tasks, {
  searchFields: ['title'],
  relationFields: ['customerId', 'businessId', 'leadId', 'dealId', 'installationId'],
  skipCreate: true,
})
app.post('/api/tasks', (req, res) => {
  if (!hasPermission(req.user, 'tasks.create')) return res.status(403).json({ message: 'Vazifa yaratish uchun ruxsat yo‘q' })
  if (req.body?.assignedEmployeeId && req.body.assignedEmployeeId !== req.user.id && !hasPermission(req.user, 'tasks.assign')) {
    return res.status(403).json({ message: 'Boshqa xodimga vazifa biriktirish uchun ruxsat yo‘q' })
  }
  const task = enrichReferences({ id: uid(), status: 'TODO', createdAt: now(), assignedEmployeeId: req.user.id, ...req.body })
  db.tasks.push(task)
  res.status(201).json(task)
})

registerResource('activities', db.activities, {
  searchFields: ['title'],
  relationFields: ['customerId', 'businessId', 'leadId', 'dealId', 'installationId'],
  skipCreate: true,
})
app.post('/api/activities', (req, res) => {
  const activity = enrichReferences({ id: uid(), employeeName: req.user.name, createdAt: now(), date: req.body.date || now(), ...req.body })
  db.activities.push(activity)
  res.status(201).json(activity)
})

registerResource('installations', db.installations, {
  searchFields: [],
  relationFields: ['customerId', 'businessId', 'dealId', 'assignedEmployeeId'],
  defaultStatus: 'PENDING',
})

// ---------------------------------------------------------------------------
// Comments (generic, entityType + entityId)
// ---------------------------------------------------------------------------
app.get('/api/comments', (req, res) => {
  const { entityType, entityId } = req.query
  const items = db.comments.filter((c) => c.entityType === entityType && c.entityId === entityId)
  res.json({ items, total: items.length })
})
app.post('/api/comments', (req, res) => {
  const comment = {
    id: uid(),
    author: { id: req.user.id, name: req.user.name, avatarUrl: req.user.avatarUrl },
    createdAt: now(),
    ...req.body,
  }
  db.comments.push(comment)
  res.status(201).json(comment)
})
app.patch('/api/comments/:id', (req, res) => {
  const comment = findOr404(res, db.comments, req.params.id, 'Izoh')
  if (!comment) return
  Object.assign(comment, req.body)
  res.json(comment)
})
app.delete('/api/comments/:id', (req, res) => {
  const index = db.comments.findIndex((c) => c.id === req.params.id)
  if (index === -1) return res.status(404).json({ message: 'Izoh topilmadi' })
  db.comments.splice(index, 1)
  res.status(204).end()
})

// ---------------------------------------------------------------------------
// Attachments (real in-memory file storage — actually downloadable)
// ---------------------------------------------------------------------------
app.get('/api/attachments', (req, res) => {
  const { entityType, entityId } = req.query
  const items = db.attachments.filter((a) => a.entityType === entityType && a.entityId === entityId)
  res.json({ items, total: items.length })
})
app.post('/api/attachments', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Fayl topilmadi' })
  const id = uid()
  db.attachmentFiles.set(id, req.file.buffer)
  const attachment = {
    id,
    entityType: req.body.entityType,
    entityId: req.body.entityId,
    name: req.file.originalname,
    size: req.file.size,
    uploadedBy: { id: req.user.id, name: req.user.name },
    url: `/api/attachments/${id}/download`,
    createdAt: now(),
  }
  db.attachments.push(attachment)
  res.status(201).json(attachment)
})
app.get('/api/attachments/:id/download', (req, res) => {
  const attachment = db.attachments.find((a) => a.id === req.params.id)
  const buffer = db.attachmentFiles.get(req.params.id)
  if (!attachment || !buffer) return res.status(404).json({ message: 'Fayl topilmadi' })
  res.setHeader('Content-Disposition', `attachment; filename="${attachment.name}"`)
  res.send(buffer)
})
app.delete('/api/attachments/:id', (req, res) => {
  const index = db.attachments.findIndex((a) => a.id === req.params.id)
  if (index === -1) return res.status(404).json({ message: 'Fayl topilmadi' })
  db.attachments.splice(index, 1)
  db.attachmentFiles.delete(req.params.id)
  res.status(204).end()
})

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
app.get('/api/notifications', (req, res) => res.json(paginate(db.notifications, req.query)))
app.get('/api/notifications/unread-count', (req, res) => res.json({ count: db.notifications.filter((n) => !n.read).length }))
app.post('/api/notifications/:id/read', (req, res) => {
  const notification = findOr404(res, db.notifications, req.params.id, 'Bildirishnoma')
  if (!notification) return
  notification.read = true
  res.json(notification)
})
app.post('/api/notifications/mark-all-read', (req, res) => {
  db.notifications.forEach((n) => (n.read = true))
  res.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Timeline — cross-entity merged history for a Customer or Deal
// ---------------------------------------------------------------------------
app.get('/api/timeline', (req, res) => {
  const { entityType, entityId } = req.query
  const events = []

  const addLead = (l) => events.push({ id: `lead-${l.id}`, type: 'LEAD_CREATED', date: l.createdAt, title: l.title, employeeName: l.assignedEmployee?.name })
  const addDeal = (d) =>
    events.push({ id: `deal-${d.id}`, type: 'STAGE_CHANGED', date: d.createdAt, title: `${d.name} — ${d.stage}`, employeeName: d.salesEmployee?.name })
  const addQuotation = (q) => events.push({ id: `quote-${q.id}`, type: 'QUOTATION_CREATED', date: q.createdAt, title: `Taklifnoma #${q.number}` })
  const addPayment = (p) =>
    events.push({ id: `pay-${p.id}`, type: 'PAYMENT_RECEIVED', date: p.date || p.createdAt, title: `${p.amount} (${p.method})`, employeeName: p.employee?.name })
  const addInstallation = (i) => {
    events.push({ id: `inst-sched-${i.id}`, type: 'INSTALLATION_SCHEDULED', date: i.createdAt, title: i.address, employeeName: i.assignedEmployee?.name })
    if (i.completedDate) events.push({ id: `inst-done-${i.id}`, type: 'INSTALLATION_COMPLETED', date: i.completedDate, title: i.address })
  }
  const addActivity = (a) => events.push({ id: `act-${a.id}`, type: a.type, date: a.date, title: a.title, description: a.description, employeeName: a.employeeName })
  const addCompletedTask = (t) => {
    if (t.status === 'COMPLETED') events.push({ id: `task-${t.id}`, type: 'TASK_COMPLETED', date: t.createdAt, title: t.title })
  }

  if (entityType === 'customer') {
    const leads = db.leads.filter((l) => l.customer?.id === entityId)
    const deals = db.deals.filter((d) => d.customer?.id === entityId)
    const dealIds = deals.map((d) => d.id)
    leads.forEach(addLead)
    deals.forEach(addDeal)
    db.quotations.filter((q) => dealIds.includes(q.dealId)).forEach(addQuotation)
    db.payments.filter((p) => dealIds.includes(p.dealId)).forEach(addPayment)
    db.installations.filter((i) => i.customer?.id === entityId || dealIds.includes(i.dealId)).forEach(addInstallation)
    db.activities.filter((a) => a.customerId === entityId).forEach(addActivity)
    db.tasks.filter((t) => t.customer?.id === entityId).forEach(addCompletedTask)
  } else if (entityType === 'deal') {
    const deal = db.deals.find((d) => d.id === entityId)
    if (deal) addDeal(deal)
    db.quotations.filter((q) => q.dealId === entityId).forEach(addQuotation)
    db.payments.filter((p) => p.dealId === entityId).forEach(addPayment)
    db.installations.filter((i) => i.dealId === entityId).forEach(addInstallation)
    db.activities.filter((a) => a.dealId === entityId).forEach(addActivity)
    db.tasks.filter((t) => t.deal?.id === entityId).forEach(addCompletedTask)
  }

  events.sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
  res.json({ items: events })
})

// ---------------------------------------------------------------------------
// Global search
// ---------------------------------------------------------------------------
app.get('/api/search', (req, res) => {
  const term = String(req.query.q || '').toLowerCase()
  if (!term) return res.json({ items: [] })

  const items = [
    ...db.customers.filter((c) => c.name.toLowerCase().includes(term)).map((c) => ({ type: 'customer', id: c.id, label: c.name })),
    ...db.businesses.filter((b) => b.name.toLowerCase().includes(term)).map((b) => ({ type: 'business', id: b.id, label: b.name })),
    ...db.leads.filter((l) => l.title.toLowerCase().includes(term)).map((l) => ({ type: 'lead', id: l.id, label: l.title })),
    ...db.deals.filter((d) => d.name.toLowerCase().includes(term)).map((d) => ({ type: 'deal', id: d.id, label: d.name })),
  ]
  res.json({ items })
})

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
app.get('/api/analytics/dashboard-summary', (req, res) => {
  res.json({
    totalLeads: db.leads.length,
    activeDeals: db.deals.filter((d) => !['WON', 'LOST'].includes(d.stage)).length,
    wonDeals: db.deals.filter((d) => d.stage === 'WON').length,
    revenue: db.payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + Number(p.amount || 0), 0),
    pendingPayments: db.payments.filter((p) => p.status === 'PENDING').length,
    installations: db.installations.length,
    tasks: db.tasks.filter((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length,
  })
})
app.get('/api/analytics/leads-by-status', (req, res) => {
  const counts = {}
  db.leads.forEach((l) => (counts[l.status] = (counts[l.status] || 0) + 1))
  res.json(Object.entries(counts).map(([status, count]) => ({ status, count })))
})
app.get('/api/analytics/deals-by-stage', (req, res) => {
  const counts = {}
  db.deals.forEach((d) => (counts[d.stage] = (counts[d.stage] || 0) + 1))
  res.json(Object.entries(counts).map(([stage, count]) => ({ stage, count })))
})
app.get('/api/analytics/revenue', (req, res) => {
  res.json([{ period: 'This month', amount: db.payments.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + Number(p.amount || 0), 0) }])
})
app.get('/api/analytics/installations-by-status', (req, res) => {
  const counts = {}
  db.installations.forEach((i) => (counts[i.status] = (counts[i.status] || 0) + 1))
  res.json(Object.entries(counts).map(([status, count]) => ({ status, count })))
})
app.get('/api/analytics/employee-performance/:id', (req, res) => {
  if (!hasPermission(req.user, 'employees.view')) return res.status(403).json({ message: 'Xodim statistikasini ko‘rish uchun ruxsat yo‘q' })
  const employeeId = req.params.id
  const customers = db.customers.filter((c) => c.assignedEmployee?.id === employeeId)
  const leads = db.leads.filter((l) => l.assignedEmployee?.id === employeeId)
  const deals = db.deals.filter((d) => d.salesEmployee?.id === employeeId)
  const wonDeals = deals.filter((d) => d.stage === 'WON')
  const revenue = customers.reduce((sum, customer) => sum + customerDealAmount(customer.id), 0)
  const tasksCompleted = db.tasks.filter((t) => t.assignedEmployeeId === employeeId && t.status === 'COMPLETED').length
  const tasksInProgress = db.tasks.filter((t) => t.assignedEmployeeId === employeeId && t.status === 'IN_PROGRESS').length
  const installationsCompleted = db.installations.filter((i) => i.assignedEmployee?.id === employeeId && i.status === 'COMPLETED').length
  const activeTasks = db.tasks.filter((t) => t.assignedEmployeeId === employeeId && !['COMPLETED', 'CANCELLED'].includes(t.status)).length
  const stageCounts = DEFAULT_CUSTOMER_STAGES.reduce((acc, stage) => ({ ...acc, [stage.id]: 0 }), {})
  customers.forEach((customer) => {
    const stage = normalizeCustomerStage(customer.stage)
    stageCounts[stage] = (stageCounts[stage] || 0) + 1
  })

  res.json({
    customers: customers.length,
    stageCounts,
    stageStats: DEFAULT_CUSTOMER_STAGES.map((stage) => ({ id: stage.id, label: stage.label, count: stageCounts[stage.id] || 0 })),
    leads: leads.length,
    deals: deals.length,
    wonDeals: wonDeals.length,
    revenue,
    tasksCompleted,
    tasksInProgress,
    activeTasks,
    installationsCompleted,
  })
})

module.exports = app
