'use strict';

const DB = (() => {
  const DB_NAME = 'cashflow-db';
  const DB_VER = 1;
  let _db = null;

  const DEFAULT_CATEGORIES = ['יציאות', 'קניות - כללי', 'קניות - לבית', 'חשבונות', 'שונות', 'רכב'];
  const DEFAULT_PAYMENT_METHODS = ['אשראי', 'ביט / פייבוקס', 'העברה בנקאית', 'הוראת קבע', 'צ\'ק', 'מזומן'];

  // ── Core IndexedDB ────────────────────────────────────────────────────────────

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('expenses')) {
          const s = db.createObjectStore('expenses', { keyPath: 'id' });
          s.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('income')) {
          const s = db.createObjectStore('income', { keyPath: 'id' });
          s.createIndex('date', 'date', { unique: false });
        }
        if (!db.objectStoreNames.contains('standing_orders')) {
          db.createObjectStore('standing_orders', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = e => { _db = e.target.result; resolve(_db); };
      req.onerror = e => reject(e.target.error);
    });
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  function getAll(storeName) {
    return open().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function getOne(storeName, key) {
    return open().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function putRecord(storeName, value) {
    return open().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readwrite').objectStore(storeName).put(value);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));
  }

  function delRecord(storeName, key) {
    return open().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readwrite').objectStore(storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  function clearStore(storeName) {
    return open().then(db => new Promise((resolve, reject) => {
      const req = db.transaction(storeName, 'readwrite').objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  }

  // ── Settings (key-value store) ────────────────────────────────────────────────

  async function getSetting(key, def) {
    const rec = await getOne('settings', key);
    return rec ? rec.value : def;
  }

  async function setSetting(key, value) {
    await putRecord('settings', { key, value });
  }

  // ── Categories ────────────────────────────────────────────────────────────────

  async function getCategories() {
    return getSetting('categories', DEFAULT_CATEGORIES);
  }

  async function addCategory(name) {
    const cats = await getCategories();
    if (cats.includes(name)) throw new Error('קטגוריה קיימת');
    cats.push(name);
    await setSetting('categories', cats);
    return cats;
  }

  async function deleteCategory(name) {
    const cats = await getCategories();
    const updated = cats.filter(c => c !== name);
    await setSetting('categories', updated);
    return updated;
  }

  // ── Payment Methods ───────────────────────────────────────────────────────────

  async function getPaymentMethods() {
    return getSetting('payment_methods', DEFAULT_PAYMENT_METHODS);
  }

  async function addPaymentMethod(name) {
    const methods = await getPaymentMethods();
    if (methods.includes(name)) throw new Error('שיטת תשלום קיימת');
    methods.push(name);
    await setSetting('payment_methods', methods);
    return methods;
  }

  async function deletePaymentMethod(name) {
    const methods = await getPaymentMethods();
    const updated = methods.filter(m => m !== name);
    await setSetting('payment_methods', updated);
    return updated;
  }

  // ── Expenses ──────────────────────────────────────────────────────────────────

  async function getExpenses({ month, search, category } = {}) {
    let expenses = await getAll('expenses');
    if (month) expenses = expenses.filter(e => e.date && e.date.startsWith(month));
    if (category) expenses = expenses.filter(e => e.category === category);
    if (search) {
      const q = search.toLowerCase();
      expenses = expenses.filter(e =>
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.notes && e.notes.toLowerCase().includes(q)) ||
        (e.category && e.category.toLowerCase().includes(q))
      );
    }
    expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return expenses;
  }

  async function addExpense(data) {
    const expense = {
      id: generateId(),
      date: data.date || '',
      category: data.category || '',
      description: data.description || '',
      amount: parseFloat(data.amount) || 0,
      payment_method: data.payment_method || '',
      notes: data.notes || '',
      created_at: new Date().toISOString()
    };
    await putRecord('expenses', expense);
    return expense;
  }

  async function updateExpense(id, data) {
    const all = await getAll('expenses');
    const existing = all.find(e => e.id === id);
    if (!existing) throw new Error('לא נמצא');
    const updated = { ...existing, ...data, id, created_at: existing.created_at };
    if (data.amount !== undefined) updated.amount = parseFloat(data.amount) || 0;
    await putRecord('expenses', updated);
    return updated;
  }

  async function deleteExpense(id) {
    await delRecord('expenses', id);
    return { success: true };
  }

  // ── Income ────────────────────────────────────────────────────────────────────

  async function getIncome({ month } = {}) {
    let income = await getAll('income');
    if (month) income = income.filter(i => i.date && i.date.startsWith(month));
    income.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return income;
  }

  async function addIncome(data) {
    const record = {
      id: generateId(),
      date: data.date || '',
      source: data.source || '',
      amount: parseFloat(data.amount) || 0,
      payment_method: data.payment_method || '',
      notes: data.notes || ''
    };
    await putRecord('income', record);
    return record;
  }

  async function updateIncome(id, data) {
    const all = await getAll('income');
    const existing = all.find(i => i.id === id);
    if (!existing) throw new Error('לא נמצא');
    const updated = { ...existing, ...data, id };
    if (data.amount !== undefined) updated.amount = parseFloat(data.amount) || 0;
    await putRecord('income', updated);
    return updated;
  }

  async function deleteIncome(id) {
    await delRecord('income', id);
    return { success: true };
  }

  // ── Standing Orders ───────────────────────────────────────────────────────────

  async function getStandingOrders() {
    return getAll('standing_orders');
  }

  async function addStandingOrder(data) {
    const order = {
      id: generateId(),
      name: data.name || '',
      category: data.category || '',
      amount: parseFloat(data.amount) || 0,
      payment_method: data.payment_method || '',
      is_active: data.is_active !== false,
      notes: data.notes || ''
    };
    await putRecord('standing_orders', order);
    return order;
  }

  async function updateStandingOrder(id, data) {
    const all = await getAll('standing_orders');
    const existing = all.find(o => o.id === id);
    if (!existing) throw new Error('לא נמצא');
    const updated = { ...existing, ...data, id };
    if (data.amount !== undefined) updated.amount = parseFloat(data.amount) || 0;
    await putRecord('standing_orders', updated);
    return updated;
  }

  async function deleteStandingOrder(id) {
    await delRecord('standing_orders', id);
    return { success: true };
  }

  // ── Savings (stored as a single settings entry) ───────────────────────────────

  async function getSavings() {
    return getSetting('savings', { investments: [], loans: [] });
  }

  async function _saveSavings(data) {
    await setSetting('savings', data);
  }

  async function addInvestment(data) {
    const savings = await getSavings();
    const inv = { id: generateId(), name: data.name || '', type: data.type || '', deposits: [], yearly: [] };
    savings.investments.push(inv);
    await _saveSavings(savings);
    return inv;
  }

  async function updateInvestment(id, data) {
    const savings = await getSavings();
    const inv = savings.investments.find(i => i.id === id);
    if (!inv) throw new Error('לא נמצא');
    if (data.current_value !== undefined) {
      inv.current_value = parseFloat(data.current_value) || 0;
      inv.current_value_date = new Date().toISOString().split('T')[0];
    }
    await _saveSavings(savings);
    return inv;
  }

  async function deleteInvestment(id) {
    const savings = await getSavings();
    savings.investments = savings.investments.filter(i => i.id !== id);
    await _saveSavings(savings);
    return { success: true };
  }

  async function addDeposit(invId, data) {
    const savings = await getSavings();
    const inv = savings.investments.find(i => i.id === invId);
    if (!inv) throw new Error('לא נמצא');
    const deposit = { id: generateId(), date: data.date || '', amount: parseFloat(data.amount) || 0, notes: data.notes || '' };
    inv.deposits.push(deposit);
    await _saveSavings(savings);
    return deposit;
  }

  async function deleteDeposit(invId, depId) {
    const savings = await getSavings();
    const inv = savings.investments.find(i => i.id === invId);
    if (!inv) throw new Error('לא נמצא');
    inv.deposits = inv.deposits.filter(d => d.id !== depId);
    await _saveSavings(savings);
    return { success: true };
  }

  async function addYearly(invId, data) {
    const savings = await getSavings();
    const inv = savings.investments.find(i => i.id === invId);
    if (!inv) throw new Error('לא נמצא');
    const yearly = { year: data.year, total_deposited: parseFloat(data.total_deposited) || 0, end_balance: parseFloat(data.end_balance) || 0 };
    const existIdx = inv.yearly.findIndex(y => y.year === data.year);
    if (existIdx >= 0) { inv.yearly[existIdx] = yearly; } else { inv.yearly.push(yearly); }
    inv.yearly.sort((a, b) => String(a.year).localeCompare(String(b.year)));
    await _saveSavings(savings);
    return yearly;
  }

  async function updateYearly(invId, year, data) {
    const savings = await getSavings();
    const inv = savings.investments.find(i => i.id === invId);
    if (!inv) throw new Error('לא נמצא');
    const idx = inv.yearly.findIndex(y => String(y.year) === String(year));
    if (idx === -1) throw new Error('לא נמצא');
    inv.yearly[idx] = {
      ...inv.yearly[idx],
      total_deposited: parseFloat(data.total_deposited) ?? inv.yearly[idx].total_deposited,
      end_balance: parseFloat(data.end_balance) ?? inv.yearly[idx].end_balance
    };
    await _saveSavings(savings);
    return inv.yearly[idx];
  }

  async function addLoan(data) {
    const savings = await getSavings();
    const loan = { id: generateId(), person: data.person || '', total_given: parseFloat(data.total_given) || 0, date_given: data.date_given || '', notes: data.notes || '', payments: [] };
    savings.loans.push(loan);
    await _saveSavings(savings);
    return loan;
  }

  async function deleteLoan(id) {
    const savings = await getSavings();
    savings.loans = savings.loans.filter(l => l.id !== id);
    await _saveSavings(savings);
    return { success: true };
  }

  async function addLoanPayment(loanId, data) {
    const savings = await getSavings();
    const loan = savings.loans.find(l => l.id === loanId);
    if (!loan) throw new Error('לא נמצא');
    const payment = { id: generateId(), date: data.date || '', amount: parseFloat(data.amount) || 0, notes: data.notes || '' };
    loan.payments.push(payment);
    await _saveSavings(savings);
    return payment;
  }

  async function deleteLoanPayment(loanId, payId) {
    const savings = await getSavings();
    const loan = savings.loans.find(l => l.id === loanId);
    if (!loan) throw new Error('לא נמצא');
    loan.payments = loan.payments.filter(p => p.id !== payId);
    await _saveSavings(savings);
    return { success: true };
  }

  // ── Dashboard Computations ────────────────────────────────────────────────────

  async function getDashboardMonthly(month) {
    const [year, mon] = month.split('-').map(Number);
    const allExpenses = await getAll('expenses');
    const allIncome = await getAll('income');
    const standingOrders = await getAll('standing_orders');

    const monthExpenses = allExpenses.filter(e => e.date && e.date.startsWith(month));
    const yearStart = `${year}-01`;
    const ytdExpenses = allExpenses.filter(e => { if (!e.date) return false; const m = e.date.slice(0, 7); return m >= yearStart && m <= month; });
    const monthIncome = allIncome.filter(i => i.date && i.date.startsWith(month));
    const ytdIncome = allIncome.filter(i => { if (!i.date) return false; const m = i.date.slice(0, 7); return m >= yearStart && m <= month; });

    const daysInMonth = new Date(year, mon, 0).getDate();
    const dailyMap = {};
    for (let d = 1; d <= daysInMonth; d++) {
      dailyMap[`${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`] = 0;
    }
    monthExpenses.forEach(e => { if (dailyMap[e.date] !== undefined) dailyMap[e.date] += e.amount; });

    const catMap = {};
    monthExpenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
    const by_category = Object.entries(catMap).map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);

    const payMap = {};
    monthExpenses.forEach(e => { const m = e.payment_method || 'לא צוין'; payMap[m] = (payMap[m] || 0) + e.amount; });
    const by_payment = Object.entries(payMap).map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total);

    const standing_total = standingOrders.filter(o => o.is_active).reduce((sum, o) => sum + o.amount, 0);
    const recent_expenses = [...allExpenses].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10);

    return {
      total_daily: Object.entries(dailyMap).map(([date, total]) => ({ date, total })),
      total_month: monthExpenses.reduce((s, e) => s + e.amount, 0),
      total_year: ytdExpenses.reduce((s, e) => s + e.amount, 0),
      total_income_month: monthIncome.reduce((s, i) => s + i.amount, 0),
      total_income_year: ytdIncome.reduce((s, i) => s + i.amount, 0),
      by_category,
      by_payment,
      standing_total,
      recent_expenses
    };
  }

  async function getDashboardAnnual(year) {
    year = String(year);
    const allExpenses = await getAll('expenses');
    const allIncome = await getAll('income');
    const standingOrders = await getAll('standing_orders');
    const standing_total = standingOrders.filter(o => o.is_active).reduce((s, o) => s + o.amount, 0);

    const by_month = [];
    for (let m = 1; m <= 12; m++) {
      const monthStr = `${year}-${String(m).padStart(2, '0')}`;
      const mE = allExpenses.filter(e => e.date && e.date.startsWith(monthStr));
      const mI = allIncome.filter(i => i.date && i.date.startsWith(monthStr));
      const expenses = mE.reduce((s, e) => s + e.amount, 0);
      const income = mI.reduce((s, i) => s + i.amount, 0);
      by_month.push({ month: monthStr, expenses, income, standing: standing_total, net: income - expenses - standing_total });
    }

    const yearExpenses = allExpenses.filter(e => e.date && e.date.startsWith(year));
    const catMap = {};
    yearExpenses.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + e.amount; });
    const by_category = Object.entries(catMap).map(([category, total]) => ({ category, total, monthly_avg: Math.round(total / 12) })).sort((a, b) => b.total - a.total);

    const total_expenses = yearExpenses.reduce((s, e) => s + e.amount, 0);
    const yearIncome = allIncome.filter(i => i.date && i.date.startsWith(year));
    const total_income = yearIncome.reduce((s, i) => s + i.amount, 0);

    return { by_month, by_category, total_expenses, total_income, net: total_income - total_expenses };
  }

  // ── Backup / Restore ──────────────────────────────────────────────────────────

  async function exportData() {
    const expenses = await getAll('expenses');
    const income = await getAll('income');
    const standing_orders = await getAll('standing_orders');
    const savings = await getSavings();
    const categories = await getCategories();
    const payment_methods = await getPaymentMethods();
    return { expenses, income, standing_orders, savings, categories, payment_methods };
  }

  async function importData(data) {
    // החלפה מלאה — המקור תמיד סמכותי (עובד גם בקוד ישן וגם חדש)
    if (data.expenses)        { await clearStore('expenses');        for (const e of data.expenses)        await putRecord('expenses', e); }
    if (data.income)          { await clearStore('income');          for (const i of data.income)          await putRecord('income', i); }
    if (data.standing_orders) { await clearStore('standing_orders'); for (const o of data.standing_orders) await putRecord('standing_orders', o); }
    if (data.savings)         await _saveSavings(data.savings);
    if (data.categories)      await setSetting('categories', data.categories);
    if (data.payment_methods) await setSetting('payment_methods', data.payment_methods);
  }

  // החלפה מלאה — המחשב סמכותי (משמש ב-syncPull)
  async function replaceData(data) {
    if (data.expenses) { await clearStore('expenses'); for (const e of data.expenses) await putRecord('expenses', e); }
    if (data.income) { await clearStore('income'); for (const i of data.income) await putRecord('income', i); }
    if (data.standing_orders) { await clearStore('standing_orders'); for (const o of data.standing_orders) await putRecord('standing_orders', o); }
    if (data.savings) await _saveSavings(data.savings);
    if (data.categories) await setSetting('categories', data.categories);
    if (data.payment_methods) await setSetting('payment_methods', data.payment_methods);
  }

  return {
    open, generateId,
    getSetting, setSetting,
    getCategories, addCategory, deleteCategory,
    getPaymentMethods, addPaymentMethod, deletePaymentMethod,
    getExpenses, addExpense, updateExpense, deleteExpense,
    getIncome, addIncome, updateIncome, deleteIncome,
    getStandingOrders, addStandingOrder, updateStandingOrder, deleteStandingOrder,
    getSavings, addInvestment, updateInvestment, deleteInvestment,
    addDeposit, deleteDeposit, addYearly, updateYearly,
    addLoan, deleteLoan, addLoanPayment, deleteLoanPayment,
    getDashboardMonthly, getDashboardAnnual,
    exportData, importData, replaceData
  };
})();
