'use strict';

// ─── GLOBALS ──────────────────────────────────────────────────────────────────

let CATEGORIES = ['יציאות', 'קניות - כללי', 'קניות - לבית', 'חשבונות', 'שונות', 'רכב'];
let PAYMENT_METHODS = ['אשראי', 'ביט / פייבוקס', 'העברה בנקאית', 'הוראת קבע', 'צ\'ק', 'מזומן'];

const CATEGORY_COLORS = {
  'יציאות': '#6366f1', 'קניות - כללי': '#3b82f6', 'קניות - לבית': '#10b981',
  'חשבונות': '#f59e0b', 'שונות': '#8b5cf6', 'רכב': '#ef4444', 'אחר': '#6b7280'
};
const COLOR_PALETTE = ['#6366f1','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#14b8a6','#f97316','#ec4899','#06b6d4'];
const MONTH_NAMES = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

let currentSection = 'monthly-summary';
let currentMonth = new Date().toISOString().slice(0, 7);
const charts = {};

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  const now = new Date();
  document.getElementById('navbar-date').textContent =
    now.toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const currentYear = now.getFullYear();
  document.getElementById('dashboard-year').value = currentYear;
  document.getElementById('expenses-month').value = currentMonth;
  document.getElementById('income-month').value = currentMonth;
  document.getElementById('summary-month').value = currentMonth;

  await loadSettings();

  document.querySelectorAll('[data-section]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); showSection(el.dataset.section); });
  });

  document.getElementById('dashboard-year').addEventListener('change', loadAnnualDashboard);
  document.getElementById('expenses-month').addEventListener('change', loadExpenses);
  document.getElementById('income-month').addEventListener('change', loadIncome);
  document.getElementById('summary-month').addEventListener('change', loadMonthlySummary);
  document.getElementById('expenses-search').addEventListener('keydown', e => { if (e.key === 'Enter') loadExpenses(); });

  document.querySelectorAll('[data-savings-tab]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      document.querySelectorAll('[data-savings-tab]').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      ['investments','loans','add'].forEach(tab => document.getElementById(`savings-tab-${tab}`).classList.add('d-none'));
      document.getElementById(`savings-tab-${el.dataset.savingsTab}`).classList.remove('d-none');
    });
  });

  document.getElementById('monthly-expenses-category-filter').addEventListener('change', () => {
    const month = document.getElementById('summary-month').value || currentMonth;
    loadMonthlyExpensesList(month);
  });

  // Settings modal tabs
  document.querySelectorAll('[data-settings-tab]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      activateSettingsTab(el.dataset.settingsTab);
    });
  });

  showSection('monthly-summary');
});

async function loadSettings() {
  try {
    const cats = await DB.getCategories();
    if (Array.isArray(cats) && cats.length > 0) CATEGORIES = cats;
  } catch (e) {}
  try {
    const methods = await DB.getPaymentMethods();
    if (Array.isArray(methods) && methods.length > 0) PAYMENT_METHODS = methods;
  } catch (e) {}
  populateSelects();
}

function populateSelects() {
  ['expense-category', 'standing-category', 'expenses-category-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const hasAll = id === 'expenses-category-filter';
    el.innerHTML = hasAll ? '<option value="">כל הקטגוריות</option>' : '';
    CATEGORIES.forEach(cat => { el.innerHTML += `<option value="${cat}">${cat}</option>`; });
  });

  ['expense-payment', 'income-payment', 'standing-payment'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<option value="">לא צוין</option>';
    PAYMENT_METHODS.forEach(m => { el.innerHTML += `<option value="${m}">${m}</option>`; });
  });

  const monthlyCatFilter = document.getElementById('monthly-expenses-category-filter');
  if (monthlyCatFilter) {
    const prev = monthlyCatFilter.value;
    monthlyCatFilter.innerHTML = '<option value="">כל הקטגוריות</option>';
    CATEGORIES.forEach(c => { monthlyCatFilter.innerHTML += `<option value="${c}"${c === prev ? ' selected' : ''}>${c}</option>`; });
  }
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────

function showSection(name) {
  currentSection = name;
  closeDrawer();
  document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));
  const sec = document.getElementById(`section-${name}`);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('[data-section]').forEach(el => el.classList.toggle('active', el.dataset.section === name));
  if (name === 'dashboard') loadAnnualDashboard();
  else if (name === 'expenses') loadExpenses();
  else if (name === 'income') loadIncome();
  else if (name === 'standing-orders') loadStandingOrders();
  else if (name === 'monthly-summary') loadMonthlySummary();
  else if (name === 'savings') loadSavings();
}

function toggleDrawer() {
  const drawer = document.getElementById('app-drawer');
  const overlay = document.getElementById('drawer-overlay');
  const isOpen = drawer.classList.contains('open');
  if (isOpen) { closeDrawer(); } else { drawer.classList.add('open'); overlay.classList.add('open'); }
}

function closeDrawer() {
  document.getElementById('app-drawer')?.classList.remove('open');
  document.getElementById('drawer-overlay')?.classList.remove('open');
}

// ─── FORMATTING ───────────────────────────────────────────────────────────────

function formatMoney(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '₪0';
  return '₪' + Number(amount).toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  if (parts.length === 2) return `${parts[1]}/${parts[0]}`;
  return dateStr;
}

function formatMonthName(monthStr) {
  if (!monthStr) return '';
  const [year, mon] = monthStr.split('-');
  return `${MONTH_NAMES[parseInt(mon, 10) - 1]} ${year}`;
}

function categoryColor(cat) {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  let hash = 0;
  for (let i = 0; i < cat.length; i++) hash = cat.charCodeAt(i) + ((hash << 5) - hash);
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

// ─── CHART HELPER ─────────────────────────────────────────────────────────────

function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

// ─── TOAST & CONFIRM ──────────────────────────────────────────────────────────

function showToast(message, type = 'success') {
  const toast = document.getElementById('app-toast');
  const body = document.getElementById('app-toast-body');
  toast.className = `toast align-items-center text-white border-0 bg-${type === 'success' ? 'success' : 'danger'}`;
  body.textContent = message;
  bootstrap.Toast.getOrCreateInstance(toast, { delay: 3000 }).show();
}

function showConfirm(message, onOk) {
  document.getElementById('confirm-message').textContent = message;
  const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('confirmModal'));
  const btn = document.getElementById('confirm-ok-btn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => { modal.hide(); onOk(); });
  modal.show();
}

// ─── PAYMENT SUMMARY ──────────────────────────────────────────────────────────

function renderPaymentSummary(containerId, byPayment) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!byPayment || byPayment.length === 0) { container.innerHTML = '<div class="col-12 text-muted small">אין נתונים</div>'; return; }
  const colorClasses = ['stat-card-blue','stat-card-green','stat-card-orange','stat-card-purple','stat-card-red','stat-card-teal','stat-card-gray'];
  const colorMap = {};
  PAYMENT_METHODS.forEach((m, i) => { colorMap[m] = colorClasses[i % colorClasses.length]; });
  container.innerHTML = byPayment.filter(p => p.method !== 'לא צוין').map(item => `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="stat-card ${colorMap[item.method] || 'stat-card-gray'}">
        <div class="stat-label" style="font-size:0.7rem">${item.method}</div>
        <div class="stat-value" style="font-size:1.1rem">${formatMoney(item.total)}</div>
      </div>
    </div>`).join('');
}

// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────

function openSettingsModal(tab = 'categories') {
  activateSettingsTab(tab);
  renderCategoriesList();
  renderPaymentMethodsList();
  bootstrap.Modal.getOrCreateInstance(document.getElementById('settingsModal')).show();
}

function activateSettingsTab(tab) {
  document.querySelectorAll('[data-settings-tab]').forEach(el => el.classList.toggle('active', el.dataset.settingsTab === tab));
  ['categories','payments','data'].forEach(t => {
    document.getElementById(`settings-tab-${t}`).classList.toggle('d-none', t !== tab);
  });
}

function renderCategoriesList() {
  const container = document.getElementById('categories-list');
  if (!container) return;
  container.innerHTML = CATEGORIES.map(cat => `
    <div class="settings-item">
      <span class="d-flex align-items-center gap-2">
        <span class="badge" style="background:${categoryColor(cat)}">&nbsp;&nbsp;</span>${cat}
      </span>
      <button class="btn btn-sm btn-outline-danger" onclick="deleteCategory('${cat.replace(/'/g, "\\'")}')">
        <i class="fas fa-trash"></i>
      </button>
    </div>`).join('') || '<p class="text-muted small">אין קטגוריות</p>';
}

function renderPaymentMethodsList() {
  const container = document.getElementById('payments-list');
  if (!container) return;
  container.innerHTML = PAYMENT_METHODS.map(m => `
    <div class="settings-item">
      <span>${m}</span>
      <button class="btn btn-sm btn-outline-danger" onclick="deletePaymentMethod('${m.replace(/'/g, "\\'")}')">
        <i class="fas fa-trash"></i>
      </button>
    </div>`).join('') || '<p class="text-muted small">אין אמצעי תשלום</p>';
}

async function addCategory() {
  const input = document.getElementById('new-category-name');
  const name = input.value.trim();
  if (!name) { showToast('נא להזין שם', 'error'); return; }
  try {
    CATEGORIES = await DB.addCategory(name);
    input.value = '';
    populateSelects();
    renderCategoriesList();
    showToast(`קטגוריה "${name}" נוספה`);
  } catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
}

async function deleteCategory(name) {
  showConfirm(`למחוק את הקטגוריה "${name}"?`, async () => {
    try {
      CATEGORIES = await DB.deleteCategory(name);
      populateSelects();
      renderCategoriesList();
      showToast(`קטגוריה "${name}" נמחקה`);
    } catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
  });
}

async function addPaymentMethod() {
  const input = document.getElementById('new-payment-name');
  const name = input.value.trim();
  if (!name) { showToast('נא להזין שם', 'error'); return; }
  try {
    PAYMENT_METHODS = await DB.addPaymentMethod(name);
    input.value = '';
    populateSelects();
    renderPaymentMethodsList();
    showToast(`אמצעי תשלום "${name}" נוסף`);
  } catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
}

async function deletePaymentMethod(name) {
  showConfirm(`למחוק את אמצעי התשלום "${name}"?`, async () => {
    try {
      PAYMENT_METHODS = await DB.deletePaymentMethod(name);
      populateSelects();
      renderPaymentMethodsList();
      showToast(`אמצעי תשלום "${name}" נמחק`);
    } catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
  });
}

// Quick inline add-category from expense modal
async function quickAddCategory() {
  const name = prompt('שם הקטגוריה החדשה:');
  if (!name || !name.trim()) return;
  try {
    CATEGORIES = await DB.addCategory(name.trim());
    populateSelects();
    document.getElementById('expense-category').value = name.trim();
    showToast(`קטגוריה "${name.trim()}" נוספה`);
  } catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
}

// ─── EXPORT / IMPORT ──────────────────────────────────────────────────────────

async function exportDataJSON() {
  try {
    const data = await DB.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cashflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('גיבוי הורד בהצלחה');
  } catch (e) { showToast('שגיאה בייצוא: ' + e.message, 'error'); }
}

async function importDataJSON() {
  const file = document.getElementById('import-file').files[0];
  if (!file) { showToast('נא לבחור קובץ', 'error'); return; }
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await DB.importData(data);
    await loadSettings();
    showToast('הנתונים יובאו בהצלחה');
    showSection(currentSection);
  } catch (e) { showToast('שגיאה בייבוא: ' + e.message, 'error'); }
}

async function exportToExcel() {
  try {
    const { expenses, income, standing_orders, savings } = await DB.exportData();
    const standingTotal = standing_orders.filter(o => o.is_active).reduce((s, o) => s + o.amount, 0);
    const HEB_MONTHS = MONTH_NAMES;
    const wb = XLSX.utils.book_new();

    const sortedExp = [...expenses].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const sortedInc = [...income].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sortedExp.map(e => ({
      'תאריך': e.date || '', 'קטגוריה': e.category || '', 'תיאור': e.description || '',
      'סכום': e.amount || 0, 'אמצעי תשלום': e.payment_method || '', 'הערות': e.notes || ''
    }))), 'הוצאות');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sortedInc.map(i => ({
      'תאריך': i.date || '', 'מקור': i.source || '', 'סכום': i.amount || 0,
      'אמצעי תשלום': i.payment_method || '', 'הערות': i.notes || ''
    }))), 'הכנסות');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(standing_orders.map(o => ({
      'שם': o.name || '', 'קטגוריה': o.category || '', 'סכום חודשי': o.amount || 0,
      'סכום שנתי': (o.amount || 0) * 12, 'אמצעי תשלום': o.payment_method || '',
      'פעיל': o.is_active ? 'כן' : 'לא', 'הערות': o.notes || ''
    }))), 'הוראות קבע');

    const monthMap = {};
    sortedExp.forEach(e => { if (!e.date) return; const m = e.date.slice(0, 7); if (!monthMap[m]) monthMap[m] = { exp: 0, inc: 0 }; monthMap[m].exp += e.amount; });
    sortedInc.forEach(i => { if (!i.date) return; const m = i.date.slice(0, 7); if (!monthMap[m]) monthMap[m] = { exp: 0, inc: 0 }; monthMap[m].inc += i.amount; });
    const monthRows = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0])).map(([m, d]) => {
      const [y, mo] = m.split('-');
      const totalExp = d.exp + standingTotal;
      return { 'חודש': `${HEB_MONTHS[parseInt(mo) - 1]} ${y}`, 'הכנסות': d.inc, 'הוצאות שוטפות': d.exp, 'הוראות קבע': standingTotal, 'סה"כ הוצאות': totalExp, 'יתרה': d.inc - totalExp };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthRows), 'סיכום חודשי');

    XLSX.writeFile(wb, `מעקב_הוצאות_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('קובץ אקסל הורד בהצלחה');
  } catch (e) { showToast('שגיאה בייצוא: ' + e.message, 'error'); }
}

// ─── ANNUAL DASHBOARD ─────────────────────────────────────────────────────────

async function loadAnnualDashboard() {
  const year = document.getElementById('dashboard-year').value || new Date().getFullYear();
  try {
    const annualData = await DB.getDashboardAnnual(year);
    const monthsData = (annualData.by_month || []).map(m => ({
      ...m, month_name: MONTH_NAMES[parseInt(m.month.split('-')[1]) - 1]
    }));
    const standingTotal = monthsData.length > 0 ? monthsData[0].standing : 0;

    document.getElementById('annual-total-expenses').textContent = formatMoney(annualData.total_expenses);
    document.getElementById('annual-total-income').textContent = formatMoney(annualData.total_income);
    const netEl = document.getElementById('annual-net');
    netEl.textContent = formatMoney(annualData.net);
    netEl.className = `stat-value ${annualData.net >= 0 ? 'text-success' : 'text-danger'}`;
    document.getElementById('annual-standing').textContent = formatMoney(standingTotal * 12);

    renderAnnualMonthlyChart(monthsData);
    renderAnnualCategoryChart(annualData.by_category);

    const allExpenses = await DB.getExpenses({});
    const yearExpenses = allExpenses.filter(e => e.date && e.date.startsWith(String(year)));
    const payMap = {};
    yearExpenses.forEach(e => { const m = e.payment_method || 'לא צוין'; if (m !== 'לא צוין') payMap[m] = (payMap[m] || 0) + e.amount; });
    renderPaymentSummary('annual-payment-summary', Object.entries(payMap).map(([method, total]) => ({ method, total })).sort((a, b) => b.total - a.total));

    renderAnnualMonthsTable(monthsData);
    renderAnnualInsights(annualData, monthsData);
  } catch (e) { showToast('שגיאה בטעינת הדשבורד: ' + e.message, 'error'); }
}

function renderAnnualMonthlyChart(monthsData) {
  destroyChart('chart-annual-monthly');
  const ctx = document.getElementById('chart-annual-monthly').getContext('2d');
  charts['chart-annual-monthly'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: monthsData.map(m => m.month_name), datasets: [
      { label: 'הכנסות', data: monthsData.map(m => m.income), backgroundColor: '#10b981', borderRadius: 4 },
      { label: 'הוצאות', data: monthsData.map(m => m.expenses), backgroundColor: '#ef4444', borderRadius: 4 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}` } } }, scales: { y: { ticks: { callback: v => formatMoney(v) } } } }
  });
}

function renderAnnualCategoryChart(byCategory) {
  destroyChart('chart-annual-category');
  if (!byCategory || byCategory.length === 0) return;
  const ctx = document.getElementById('chart-annual-category').getContext('2d');
  charts['chart-annual-category'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: byCategory.map(d => d.category), datasets: [{ label: 'סכום', data: byCategory.map(d => d.total), backgroundColor: byCategory.map(d => categoryColor(d.category)), borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${formatMoney(ctx.parsed.x)}` } } }, scales: { x: { ticks: { callback: v => formatMoney(v) } } } }
  });
}

function renderAnnualMonthsTable(monthsData) {
  const tbody = document.getElementById('annual-months-table');
  const hasData = monthsData.filter(m => m.expenses > 0 || m.income > 0);
  if (hasData.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">אין נתונים לשנה זו</td></tr>'; return; }
  tbody.innerHTML = hasData.map(m => {
    const netClass = m.net >= 0 ? 'text-success fw-bold' : 'text-danger fw-bold';
    return `<tr><td class="fw-semibold">${m.month_name}</td><td class="text-end text-danger">${formatMoney(m.expenses)}</td><td class="text-end text-success">${formatMoney(m.income)}</td><td class="text-end text-warning">${formatMoney(m.standing)}</td><td class="text-end ${netClass}">${formatMoney(m.net)}</td></tr>`;
  }).join('');
}

function renderAnnualInsights(annualData, monthsData) {
  const list = document.getElementById('annual-insights-list');
  const insights = [];
  const { total_expenses, total_income, net, by_category } = annualData;
  if (net >= 0) insights.push(`✅ יתרה שנתית חיובית של ${formatMoney(net)}`);
  else insights.push(`⚠️ גירעון שנתי של ${formatMoney(Math.abs(net))} — הוצאות עולות על הכנסות`);
  const activeMonths = monthsData.filter(m => m.income > 0 || m.expenses > 0);
  if (activeMonths.length > 0) {
    const bestMonth = activeMonths.reduce((best, m) => (m.income - m.expenses) > (best.income - best.expenses) ? m : best, activeMonths[0]);
    insights.push(`📈 החודש הטוב ביותר: ${bestMonth.month_name} (יתרה ${formatMoney(bestMonth.income - bestMonth.expenses)})`);
    const worstMonth = activeMonths.reduce((worst, m) => m.expenses > worst.expenses ? m : worst, activeMonths[0]);
    insights.push(`📉 חודש ההוצאות הגבוהות: ${worstMonth.month_name} (${formatMoney(worstMonth.expenses)})`);
  }
  if (by_category && by_category.length > 0) {
    const top = by_category[0];
    const pct = total_expenses > 0 ? Math.round(top.total / total_expenses * 100) : 0;
    insights.push(`🏷️ קטגוריה מובילה: ${top.category} (${formatMoney(top.total)}, ${pct}%)`);
  }
  list.innerHTML = insights.map(i => `<li class="mb-1">${i}</li>`).join('');
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

async function loadExpenses() {
  const month = document.getElementById('expenses-month').value;
  const search = document.getElementById('expenses-search').value;
  const category = document.getElementById('expenses-category-filter').value;
  try {
    const expenses = await DB.getExpenses({ month, search, category });
    renderExpensesTable(expenses);
  } catch (e) { showToast('שגיאה בטעינת הוצאות: ' + e.message, 'error'); }
}

function renderExpensesTable(expenses) {
  const tbody = document.getElementById('expenses-table-body');
  document.getElementById('expenses-count').textContent = expenses.length;
  document.getElementById('expenses-total-display').textContent = formatMoney(expenses.reduce((s, e) => s + e.amount, 0));
  if (expenses.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">אין הוצאות לתצוגה</td></tr>'; return; }
  tbody.innerHTML = expenses.map(e => `
    <tr>
      <td>${formatDate(e.date)}</td>
      <td><span class="badge cat-badge" style="background:${categoryColor(e.category)}">${e.category}</span></td>
      <td>${e.description || ''}</td>
      <td class="fw-bold">${formatMoney(e.amount)}</td>
      <td><small>${e.payment_method || ''}</small></td>
      <td><small class="text-muted">${e.notes || ''}</small></td>
      <td>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="openExpenseModal('${e.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteExpense('${e.id}','${(e.description||'').replace(/'/g,'')}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

async function openExpenseModal(id) {
  document.getElementById('expense-edit-id').value = id || '';
  document.getElementById('expenseModalTitle').textContent = id ? 'עריכת הוצאה' : 'הוספת הוצאה';
  document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('expense-category').value = CATEGORIES[0] || '';
  document.getElementById('expense-description').value = '';
  document.getElementById('expense-amount').value = '';
  document.getElementById('expense-payment').value = '';
  document.getElementById('expense-notes').value = '';
  if (id) {
    try {
      const all = await DB.getExpenses({});
      const exp = all.find(e => e.id === id);
      if (exp) {
        document.getElementById('expense-date').value = exp.date || '';
        document.getElementById('expense-category').value = exp.category || '';
        document.getElementById('expense-description').value = exp.description || '';
        document.getElementById('expense-amount').value = exp.amount || '';
        document.getElementById('expense-payment').value = exp.payment_method || '';
        document.getElementById('expense-notes').value = exp.notes || '';
      }
    } catch (e) {}
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('expenseModal')).show();
}

async function saveExpense() {
  const id = document.getElementById('expense-edit-id').value;
  const data = {
    date: document.getElementById('expense-date').value,
    category: document.getElementById('expense-category').value,
    description: document.getElementById('expense-description').value,
    amount: parseFloat(document.getElementById('expense-amount').value) || 0,
    payment_method: document.getElementById('expense-payment').value,
    notes: document.getElementById('expense-notes').value
  };
  if (!data.date || !data.description || !data.amount) { showToast('נא למלא את כל השדות החובה', 'error'); return; }
  try {
    if (id) { await DB.updateExpense(id, data); showToast('ההוצאה עודכנה בהצלחה'); }
    else { await DB.addExpense(data); showToast('ההוצאה נוספה בהצלחה'); }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('expenseModal')).hide();
    if (currentSection === 'monthly-summary') loadMonthlySummary(); else loadExpenses();
  } catch (e) { showToast('שגיאה בשמירה: ' + e.message, 'error'); }
}

async function deleteExpense(id, desc) {
  showConfirm(`למחוק את ההוצאה "${desc}"?`, async () => {
    try { await DB.deleteExpense(id); showToast('ההוצאה נמחקה'); loadExpenses(); }
    catch (e) { showToast('שגיאה במחיקה: ' + e.message, 'error'); }
  });
}

// ─── INCOME ───────────────────────────────────────────────────────────────────

async function loadIncome() {
  const month = document.getElementById('income-month').value;
  try { renderIncomeTable(await DB.getIncome({ month })); }
  catch (e) { showToast('שגיאה בטעינת הכנסות: ' + e.message, 'error'); }
}

function renderIncomeTable(income) {
  const tbody = document.getElementById('income-table-body');
  document.getElementById('income-total-display').textContent = formatMoney(income.reduce((s, i) => s + i.amount, 0));
  if (income.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">אין הכנסות לתצוגה</td></tr>'; return; }
  tbody.innerHTML = income.map(i => `
    <tr>
      <td>${formatDate(i.date)}</td><td class="fw-semibold">${i.source || ''}</td>
      <td class="fw-bold text-success">${formatMoney(i.amount)}</td>
      <td><small>${i.payment_method || ''}</small></td>
      <td><small class="text-muted">${i.notes || ''}</small></td>
      <td>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="openIncomeModal('${i.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteIncome('${i.id}','${(i.source||'').replace(/'/g,'')}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

async function openIncomeModal(id) {
  document.getElementById('income-edit-id').value = id || '';
  document.getElementById('incomeModalTitle').textContent = id ? 'עריכת הכנסה' : 'הוספת הכנסה';
  document.getElementById('income-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('income-source').value = '';
  document.getElementById('income-amount').value = '';
  document.getElementById('income-payment').value = '';
  document.getElementById('income-notes').value = '';
  if (id) {
    try {
      const all = await DB.getIncome({});
      const rec = all.find(i => i.id === id);
      if (rec) {
        document.getElementById('income-date').value = rec.date || '';
        document.getElementById('income-source').value = rec.source || '';
        document.getElementById('income-amount').value = rec.amount || '';
        document.getElementById('income-payment').value = rec.payment_method || '';
        document.getElementById('income-notes').value = rec.notes || '';
      }
    } catch (e) {}
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('incomeModal')).show();
}

async function saveIncome() {
  const id = document.getElementById('income-edit-id').value;
  const data = {
    date: document.getElementById('income-date').value, source: document.getElementById('income-source').value,
    amount: parseFloat(document.getElementById('income-amount').value) || 0,
    payment_method: document.getElementById('income-payment').value, notes: document.getElementById('income-notes').value
  };
  if (!data.date || !data.source || !data.amount) { showToast('נא למלא את כל השדות החובה', 'error'); return; }
  try {
    if (id) { await DB.updateIncome(id, data); showToast('ההכנסה עודכנה בהצלחה'); }
    else { await DB.addIncome(data); showToast('ההכנסה נוספה בהצלחה'); }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('incomeModal')).hide();
    if (currentSection === 'monthly-summary') loadMonthlySummary(); else loadIncome();
  } catch (e) { showToast('שגיאה בשמירה: ' + e.message, 'error'); }
}

async function deleteIncome(id, source) {
  showConfirm(`למחוק את ההכנסה "${source}"?`, async () => {
    try { await DB.deleteIncome(id); showToast('ההכנסה נמחקה'); loadIncome(); }
    catch (e) { showToast('שגיאה במחיקה: ' + e.message, 'error'); }
  });
}

// ─── STANDING ORDERS ──────────────────────────────────────────────────────────

async function loadStandingOrders() {
  try { renderStandingOrders(await DB.getStandingOrders()); }
  catch (e) { showToast('שגיאה בטעינת הוראות קבע: ' + e.message, 'error'); }
}

function renderStandingOrders(orders) {
  const container = document.getElementById('standing-orders-container');
  document.getElementById('standing-total-display').textContent = formatMoney(orders.filter(o => o.is_active).reduce((s, o) => s + o.amount, 0));
  if (orders.length === 0) { container.innerHTML = '<div class="col-12"><p class="text-center text-muted">אין הוראות קבע</p></div>'; return; }
  container.innerHTML = orders.map(o => `
    <div class="col-sm-6 col-md-4 col-lg-3">
      <div class="card shadow-sm standing-card ${o.is_active ? '' : 'standing-inactive'}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <h6 class="card-title mb-0">${o.name}</h6>
            <div class="form-check form-switch mb-0"><input class="form-check-input" type="checkbox" ${o.is_active ? 'checked' : ''} onchange="toggleStanding('${o.id}', this.checked)"></div>
          </div>
          <div class="fs-5 fw-bold mb-1">${formatMoney(o.amount)}</div>
          <div class="small text-muted mb-1">${o.category || ''}</div>
          <div class="small text-muted mb-2">${o.payment_method || ''}</div>
          ${o.notes ? `<div class="small fst-italic text-muted mb-2">${o.notes}</div>` : ''}
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-outline-primary" onclick="openStandingModal('${o.id}')"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteStandingOrder('${o.id}','${o.name.replace(/'/g,'')}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

async function openStandingModal(id) {
  document.getElementById('standing-edit-id').value = id || '';
  document.getElementById('standingModalTitle').textContent = id ? 'עריכת הוראת קבע' : 'הוספת הוראת קבע';
  document.getElementById('standing-name').value = '';
  document.getElementById('standing-category').value = CATEGORIES[0] || '';
  document.getElementById('standing-amount').value = '';
  document.getElementById('standing-payment').value = '';
  document.getElementById('standing-notes').value = '';
  document.getElementById('standing-active').checked = true;
  if (id) {
    try {
      const all = await DB.getStandingOrders();
      const rec = all.find(o => o.id === id);
      if (rec) {
        document.getElementById('standing-name').value = rec.name || '';
        document.getElementById('standing-category').value = rec.category || '';
        document.getElementById('standing-amount').value = rec.amount || '';
        document.getElementById('standing-payment').value = rec.payment_method || '';
        document.getElementById('standing-notes').value = rec.notes || '';
        document.getElementById('standing-active').checked = rec.is_active;
      }
    } catch (e) {}
  }
  bootstrap.Modal.getOrCreateInstance(document.getElementById('standingModal')).show();
}

async function saveStandingOrder() {
  const id = document.getElementById('standing-edit-id').value;
  const data = {
    name: document.getElementById('standing-name').value, category: document.getElementById('standing-category').value,
    amount: parseFloat(document.getElementById('standing-amount').value) || 0,
    payment_method: document.getElementById('standing-payment').value,
    notes: document.getElementById('standing-notes').value, is_active: document.getElementById('standing-active').checked
  };
  if (!data.name || !data.amount) { showToast('נא למלא שם וסכום', 'error'); return; }
  try {
    if (id) { await DB.updateStandingOrder(id, data); showToast('הוראת הקבע עודכנה'); }
    else { await DB.addStandingOrder(data); showToast('הוראת הקבע נוספה'); }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('standingModal')).hide();
    loadStandingOrders();
  } catch (e) { showToast('שגיאה בשמירה: ' + e.message, 'error'); }
}

async function toggleStanding(id, isActive) {
  try { await DB.updateStandingOrder(id, { is_active: isActive }); loadStandingOrders(); }
  catch (e) { showToast('שגיאה בעדכון: ' + e.message, 'error'); }
}

async function deleteStandingOrder(id, name) {
  showConfirm(`למחוק את הוראת הקבע "${name}"?`, async () => {
    try { await DB.deleteStandingOrder(id); showToast('הוראת הקבע נמחקה'); loadStandingOrders(); }
    catch (e) { showToast('שגיאה במחיקה: ' + e.message, 'error'); }
  });
}

// ─── MONTHLY SUMMARY ──────────────────────────────────────────────────────────

async function loadMonthlySummary() {
  const month = document.getElementById('summary-month').value || currentMonth;
  try {
    const data = await DB.getDashboardMonthly(month);
    const standingTotal = data.standing_total;
    const totalExpenses = data.total_month + standingTotal;

    document.getElementById('summary-income-card').textContent = formatMoney(data.total_income_month);
    document.getElementById('summary-expenses-card').textContent = formatMoney(totalExpenses);
    document.getElementById('summary-expenses-sub').textContent = `שוטפות ${formatMoney(data.total_month)} | קבע ${formatMoney(standingTotal)}`;

    const balance = data.total_income_month - totalExpenses;
    const balEl = document.getElementById('summary-balance-card');
    balEl.textContent = formatMoney(balance);
    balEl.className = `stat-value ${balance >= 0 ? 'text-success' : 'text-danger'}`;

    loadMonthlyExpensesList(month);
    loadMonthlyIncomeList(month);

    document.getElementById('summary-category-cards').innerHTML = data.by_category.map(c => `
      <div class="col-6 col-md-4 col-lg-2">
        <div class="stat-card" style="border-top: 4px solid ${categoryColor(c.category)}">
          <div class="stat-label">${c.category}</div>
          <div class="stat-value" style="font-size:1.3rem">${formatMoney(c.total)}</div>
        </div>
      </div>`).join('');

    renderMonthlyCategoryChart(data.by_category);
    renderPaymentSummary('monthly-payment-summary', data.by_payment);
    await renderMonthlySummaryChart(month);
    await renderComparisonTable(month);
    renderMonthlyInsights(data, standingTotal);
  } catch (e) { showToast('שגיאה בטעינת סיכום: ' + e.message, 'error'); }
}

async function loadMonthlyExpensesList(month) {
  const catFilter = document.getElementById('monthly-expenses-category-filter').value;
  try {
    let expenses = await DB.getExpenses({ month });
    if (catFilter) expenses = expenses.filter(e => e.category === catFilter);
    renderMonthlyExpensesTable(expenses);
  } catch (e) { showToast('שגיאה בטעינת הוצאות: ' + e.message, 'error'); }
}

function renderMonthlyExpensesTable(expenses) {
  const tbody = document.getElementById('monthly-expenses-table-body');
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  document.getElementById('monthly-expenses-count').textContent = expenses.length;
  document.getElementById('monthly-expenses-total').textContent = formatMoney(total);
  document.getElementById('monthly-expenses-badge').textContent = `${formatMoney(total)} | ${expenses.length} פריטים`;
  if (expenses.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">אין הוצאות</td></tr>'; return; }
  tbody.innerHTML = expenses.map(e => `
    <tr>
      <td>${formatDate(e.date)}</td>
      <td><span class="badge cat-badge" style="background:${categoryColor(e.category)}">${e.category}</span></td>
      <td>${e.description || ''}</td>
      <td class="text-end fw-bold">${formatMoney(e.amount)}</td>
      <td><small>${e.payment_method || ''}</small></td>
      <td>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="openExpenseModal('${e.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteExpense('${e.id}','${(e.description||'').replace(/'/g,'')}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

async function loadMonthlyIncomeList(month) {
  try { renderMonthlyIncomeTable(await DB.getIncome({ month })); }
  catch (e) { showToast('שגיאה בטעינת הכנסות: ' + e.message, 'error'); }
}

function renderMonthlyIncomeTable(income) {
  const tbody = document.getElementById('monthly-income-table-body');
  const total = income.reduce((s, i) => s + i.amount, 0);
  document.getElementById('monthly-income-badge').textContent = formatMoney(total);
  if (income.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">אין הכנסות</td></tr>'; return; }
  tbody.innerHTML = income.map(i => `
    <tr>
      <td>${formatDate(i.date)}</td><td class="fw-semibold">${i.source || ''}</td>
      <td class="text-end fw-bold text-success">${formatMoney(i.amount)}</td>
      <td><small class="text-muted">${i.notes || ''}</small></td>
      <td>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="openIncomeModal('${i.id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteIncome('${i.id}','${(i.source||'').replace(/'/g,'')}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

function renderMonthlyCategoryChart(byCategory) {
  destroyChart('chart-monthly-category');
  if (!byCategory || byCategory.length === 0) return;
  const ctx = document.getElementById('chart-monthly-category').getContext('2d');
  charts['chart-monthly-category'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: byCategory.map(d => d.category), datasets: [{ label: 'סכום', data: byCategory.map(d => d.total), backgroundColor: byCategory.map(d => categoryColor(d.category)), borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${formatMoney(ctx.parsed.x)}` } } }, scales: { x: { ticks: { callback: v => formatMoney(v) } } } }
  });
}

async function renderMonthlySummaryChart(currentMonthStr) {
  const months = [];
  const [y, m] = currentMonthStr.split('-').map(Number);
  for (let i = 5; i >= 0; i--) {
    let month = m - i, year = y;
    while (month <= 0) { month += 12; year--; }
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  const expenseData = [], incomeData = [];
  for (const mo of months) {
    const d = await DB.getDashboardMonthly(mo);
    expenseData.push(d.total_month); incomeData.push(d.total_income_month);
  }
  destroyChart('chart-monthly-summary');
  const ctx = document.getElementById('chart-monthly-summary').getContext('2d');
  charts['chart-monthly-summary'] = new Chart(ctx, {
    type: 'bar',
    data: { labels: months.map(formatMonthName), datasets: [
      { label: 'הכנסות', data: incomeData, backgroundColor: '#10b981', borderRadius: 4 },
      { label: 'הוצאות', data: expenseData, backgroundColor: '#ef4444', borderRadius: 4 }
    ]},
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatMoney(ctx.parsed.y)}` } } }, scales: { y: { ticks: { callback: v => formatMoney(v) } } } }
  });
}

async function renderComparisonTable(currentMonthStr) {
  const months = [];
  const [y, m] = currentMonthStr.split('-').map(Number);
  for (let i = 2; i >= 0; i--) {
    let month = m - i, year = y;
    while (month <= 0) { month += 12; year--; }
    months.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  const monthData = {};
  for (const mo of months) { const d = await DB.getDashboardMonthly(mo); monthData[mo] = d.by_category; }
  const allCats = new Set();
  Object.values(monthData).forEach(arr => arr.forEach(c => allCats.add(c.category)));
  document.getElementById('summary-comparison-head').innerHTML = `<tr><th>קטגוריה</th>${months.map(mo => `<th class="text-end">${formatMonthName(mo)}</th>`).join('')}</tr>`;
  const rows = [...allCats].map(cat => {
    const cols = months.map(mo => { const f = (monthData[mo] || []).find(c => c.category === cat); return `<td class="text-end">${f ? formatMoney(f.total) : '—'}</td>`; });
    return `<tr><td><span class="badge" style="background:${categoryColor(cat)}">${cat}</span></td>${cols.join('')}</tr>`;
  });
  const totalCols = months.map(mo => `<td class="text-end fw-bold">${formatMoney((monthData[mo] || []).reduce((s, c) => s + c.total, 0))}</td>`);
  rows.push(`<tr class="table-active fw-bold"><td>סה"כ</td>${totalCols.join('')}</tr>`);
  document.getElementById('summary-comparison-body').innerHTML = rows.join('');
}

function renderMonthlyInsights(data, standingTotal) {
  const list = document.getElementById('monthly-insights-list');
  const insights = [];
  const { total_month, total_income_month, by_category } = data;
  const balance = total_income_month - total_month - standingTotal;
  if (total_month > total_income_month) insights.push(`⚠️ החודש הוצאות עולות על הכנסות ב-${formatMoney(total_month - total_income_month)}`);
  else if (balance >= 0) insights.push(`✅ יתרה חיובית של ${formatMoney(balance)} החודש`);
  if (by_category && by_category.length > 0) {
    const top = by_category[0];
    const pct = total_month > 0 ? Math.round(top.total / total_month * 100) : 0;
    insights.push(`🏷️ הקטגוריה הגדולה: ${top.category} (${formatMoney(top.total)}, ${pct}%)`);
    if (pct > 40) insights.push(`⚠️ שים לב: ${top.category} מהווה ${pct}% מסך ההוצאות`);
  }
  if (standingTotal > 0) {
    const pct = total_income_month > 0 ? Math.round(standingTotal / total_income_month * 100) : 0;
    insights.push(`🔄 הוראות קבע מהוות ${pct}% מההכנסות (${formatMoney(standingTotal)})`);
  }
  if (insights.length === 0) insights.push('אין נתונים מספיקים לתובנות החודש');
  list.innerHTML = insights.map(i => `<li class="mb-1">${i}</li>`).join('');
}

// ─── SAVINGS ──────────────────────────────────────────────────────────────────

async function loadSavings() {
  try { const savings = await DB.getSavings(); renderInvestments(savings.investments || []); renderLoans(savings.loans || []); }
  catch (e) { showToast('שגיאה בטעינת חיסכון: ' + e.message, 'error'); }
}

function renderInvestments(investments) {
  const summaryContainer = document.getElementById('investments-summary-cards');
  const accordion = document.getElementById('investments-accordion');
  if (investments.length === 0) { summaryContainer.innerHTML = ''; accordion.innerHTML = '<p class="text-muted text-center">אין חשבונות השקעה</p>'; return; }
  summaryContainer.innerHTML = investments.map(inv => {
    const totalDeposited = inv.deposits.reduce((s, d) => s + d.amount, 0);
    const lastYearly = inv.yearly.length > 0 ? inv.yearly[inv.yearly.length - 1] : null;
    const displayDeposited = lastYearly ? lastYearly.total_deposited : totalDeposited;
    const displayBalance = lastYearly ? lastYearly.end_balance : null;
    const anchorId = `inv-accordion-${inv.id}`;
    return `<div class="col-sm-6 col-lg-4"><div class="stat-card stat-card-blue">
      <div class="d-flex justify-content-between align-items-start mb-1"><div class="fw-bold">${inv.name}</div><span class="badge bg-secondary">${inv.type}</span></div>
      <div class="small text-muted mb-1">סך הפקדות: <strong>${formatMoney(displayDeposited)}</strong></div>
      ${displayBalance !== null ? `<div class="small text-muted mb-2">יתרה אחרונה: <strong class="text-success">${formatMoney(displayBalance)}</strong></div>` : ''}
      <a href="#${anchorId}" class="btn btn-sm btn-outline-primary w-100" onclick="scrollToAccordion('${anchorId}')">עבור לחשבון <i class="fas fa-arrow-left ms-1"></i></a>
    </div></div>`;
  }).join('');

  accordion.innerHTML = investments.map(inv => {
    const totalDeposited = inv.deposits.reduce((s, d) => s + d.amount, 0);
    const lastYearly = inv.yearly.length > 0 ? inv.yearly[inv.yearly.length - 1] : null;
    const accordionId = `inv-accordion-${inv.id}`;
    const collapseId = `inv-collapse-${inv.id}`;
    const depositsHtml = inv.deposits.length > 0 ? `
      <h6 class="text-muted small text-uppercase mb-1 mt-3">הפקדות</h6>
      <table class="table table-sm table-hover mb-0"><thead><tr><th>תאריך</th><th class="text-end">סכום</th><th>הערות</th><th></th></tr></thead>
      <tbody>${inv.deposits.map(d => `<tr><td>${formatDate(d.date)}</td><td class="text-end">${formatMoney(d.amount)}</td><td><small class="text-muted">${d.notes||''}</small></td><td><button class="btn btn-xs btn-outline-danger" onclick="deleteDeposit('${inv.id}','${d.id}')"><i class="fas fa-times"></i></button></td></tr>`).join('')}</tbody>
      </table>` : '<p class="text-muted small mt-2">אין הפקדות רשומות</p>';
    let yearlyHtml = '';
    if (inv.yearly.length > 0) {
      const yearlyRows = inv.yearly.map((y, idx) => {
        const prev = idx > 0 ? inv.yearly[idx - 1] : null;
        const depositDiff = prev !== null ? y.total_deposited - prev.total_deposited : y.total_deposited;
        const retShekels = y.end_balance - y.total_deposited;
        const retPct = y.total_deposited > 0 ? ((y.end_balance - y.total_deposited) / y.total_deposited * 100).toFixed(1) : null;
        const dClass = depositDiff >= 0 ? 'text-success' : 'text-danger';
        const rClass = retShekels >= 0 ? 'text-success' : 'text-danger';
        return `<tr><td>${y.year}</td><td class="text-end ${dClass}">${depositDiff >= 0 ? '+' : ''}${formatMoney(depositDiff)}</td><td class="text-end">${formatMoney(y.total_deposited)}</td><td class="text-end fw-bold">${formatMoney(y.end_balance)}</td><td class="text-end ${rClass}">${formatMoney(retShekels)}</td><td class="text-end ${rClass}">${retPct !== null ? retPct + '%' : '—'}</td></tr>`;
      }).join('');
      yearlyHtml = `<h6 class="text-muted small text-uppercase mb-1 mt-3">נתונים שנתיים</h6><div class="table-responsive"><table class="table table-sm table-hover mb-0"><thead><tr><th>שנה</th><th class="text-end">הפקדה/משיכה</th><th class="text-end">סה"כ הפקדות</th><th class="text-end">יתרה</th><th class="text-end">תשואה (₪)</th><th class="text-end">תשואה (%)</th></tr></thead><tbody>${yearlyRows}</tbody></table></div>`;
    }
    const savedVal = inv.current_value || '';
    const savedDate = inv.current_value_date ? ` (${formatDate(inv.current_value_date)})` : '';
    const refDeposited = lastYearly ? lastYearly.total_deposited : totalDeposited;
    let currentReturnHtml = '';
    if (savedVal) {
      const retShekels = savedVal - refDeposited;
      const retPct = refDeposited > 0 ? (retShekels / refDeposited * 100).toFixed(1) : 0;
      const retClass = retShekels >= 0 ? 'text-success' : 'text-danger';
      const sign = retShekels >= 0 ? '+' : '';
      currentReturnHtml = `<span class="ms-2 fw-bold ${retClass}">${sign}${formatMoney(retShekels)} (${sign}${retPct}%)</span>`;
    }
    return `<div class="accordion-item mb-2 border rounded" id="${accordionId}">
      <h2 class="accordion-header"><button class="accordion-button collapsed rounded" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
        <strong class="me-2">${inv.name}</strong><span class="badge bg-secondary me-2">${inv.type}</span>
        ${lastYearly ? `<span class="text-success small me-2">יתרה: ${formatMoney(lastYearly.end_balance)}</span>` : ''}
        <span class="text-muted small">הפקדות: ${formatMoney(totalDeposited)}</span>
      </button></h2>
      <div id="${collapseId}" class="accordion-collapse collapse"><div class="accordion-body">
        <div class="d-flex gap-2 mb-3 flex-wrap">
          <button class="btn btn-sm btn-outline-primary" onclick="openDepositModal('${inv.id}')"><i class="fas fa-plus me-1"></i>הוסף הפקדה</button>
          <button class="btn btn-sm btn-outline-secondary" onclick="openYearlyModal('${inv.id}')"><i class="fas fa-chart-line me-1"></i>הוסף נתון שנתי</button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteInvestment('${inv.id}','${inv.name.replace(/'/g,'')}')"><i class="fas fa-trash me-1"></i>מחק חשבון</button>
        </div>
        <div class="border rounded p-3 mb-3 bg-light">
          <div class="fw-semibold small text-uppercase text-muted mb-2">שווי נוכחי ותשואה</div>
          <div class="d-flex align-items-end gap-2 flex-wrap">
            <div><label class="form-label small mb-1">שווי תיק נוכחי (₪)${savedDate ? '<span class="text-muted ms-1">'+savedDate+'</span>' : ''}</label>
            <input type="number" id="current-val-${inv.id}" class="form-control form-control-sm" style="width:160px" value="${savedVal}" placeholder="הזן שווי" data-deposited="${refDeposited}"></div>
            <button class="btn btn-sm btn-primary" onclick="updateCurrentValue('${inv.id}')"><i class="fas fa-calculator me-1"></i>חשב תשואה</button>
            <div id="return-display-${inv.id}">${currentReturnHtml}</div>
          </div>
        </div>
        ${depositsHtml}${yearlyHtml}
      </div></div>
    </div>`;
  }).join('');
}

async function updateCurrentValue(invId) {
  const input = document.getElementById(`current-val-${invId}`);
  const currentVal = parseFloat(input.value) || 0;
  if (!currentVal) { showToast('נא להזין שווי תיק', 'error'); return; }
  const refDeposited = parseFloat(input.dataset.deposited) || 0;
  const retShekels = currentVal - refDeposited;
  const retPct = refDeposited > 0 ? (retShekels / refDeposited * 100).toFixed(1) : 0;
  const retClass = retShekels >= 0 ? 'text-success' : 'text-danger';
  const sign = retShekels >= 0 ? '+' : '';
  document.getElementById(`return-display-${invId}`).innerHTML = `<span class="fw-bold fs-5 ${retClass}">${sign}${formatMoney(retShekels)} (${sign}${retPct}%)</span>`;
  DB.updateInvestment(invId, { current_value: currentVal }).catch(() => {});
  showToast('תשואה חושבה בהצלחה');
}

function scrollToAccordion(anchorId) {
  setTimeout(() => {
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const collapseId = anchorId.replace('inv-accordion-', 'inv-collapse-');
      const collapseEl = document.getElementById(collapseId);
      if (collapseEl) bootstrap.Collapse.getOrCreateInstance(collapseEl, { toggle: false }).show();
    }
  }, 100);
}

function renderLoans(loans) {
  const container = document.getElementById('loans-container');
  if (loans.length === 0) { container.innerHTML = '<p class="text-muted text-center">אין הלוואות</p>'; return; }
  container.innerHTML = loans.map(loan => {
    const totalReturned = loan.payments.reduce((s, p) => s + p.amount, 0);
    const remaining = loan.total_given - totalReturned;
    const paymentsHtml = loan.payments.length > 0 ? `<div class="mb-2"><h6 class="text-muted small text-uppercase mb-1">תשלומים</h6>
      <table class="table table-sm table-hover mb-0"><thead><tr><th>תאריך</th><th class="text-end">סכום</th><th>הערות</th><th></th></tr></thead>
      <tbody>${loan.payments.map(p => `<tr><td>${formatDate(p.date)}</td><td class="text-end">${formatMoney(p.amount)}</td><td><small class="text-muted">${p.notes||''}</small></td><td><button class="btn btn-xs btn-outline-danger" onclick="deleteLoanPayment('${loan.id}','${p.id}')"><i class="fas fa-times"></i></button></td></tr>`).join('')}</tbody>
      </table></div>` : '';
    return `<div class="card shadow-sm mb-4">
      <div class="card-header d-flex justify-content-between align-items-center">
        <strong>${loan.person}</strong>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-success" onclick="openLoanPaymentModal('${loan.id}')"><i class="fas fa-plus me-1"></i>תשלום</button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteLoan('${loan.id}','${loan.person.replace(/'/g,'')}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="card-body">
        <div class="row g-3 mb-3">
          <div class="col-6 col-md-3"><div class="stat-card stat-card-blue"><div class="stat-label">ניתן</div><div class="stat-value" style="font-size:1.2rem">${formatMoney(loan.total_given)}</div></div></div>
          <div class="col-6 col-md-3"><div class="stat-card stat-card-green"><div class="stat-label">הוחזר</div><div class="stat-value" style="font-size:1.2rem">${formatMoney(totalReturned)}</div></div></div>
          <div class="col-6 col-md-3"><div class="stat-card ${remaining > 0 ? 'stat-card-orange' : 'stat-card-green'}"><div class="stat-label">נותר</div><div class="stat-value" style="font-size:1.2rem">${formatMoney(remaining)}</div></div></div>
        </div>
        ${loan.notes ? `<p class="text-muted small mb-2">${loan.notes}</p>` : ''}
        <p class="small text-muted mb-2">תאריך מתן: ${formatDate(loan.date_given)}</p>
        ${paymentsHtml}
      </div>
    </div>`;
  }).join('');
}

async function addInvestment() {
  const name = document.getElementById('new-inv-name').value.trim();
  const type = document.getElementById('new-inv-type').value;
  if (!name) { showToast('נא להזין שם', 'error'); return; }
  try { await DB.addInvestment({ name, type }); showToast('חשבון נוסף בהצלחה'); document.getElementById('new-inv-name').value = ''; loadSavings(); }
  catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
}

async function addInvestmentFromModal() {
  const name = document.getElementById('modal-inv-name').value.trim();
  const type = document.getElementById('modal-inv-type').value;
  if (!name) { showToast('נא להזין שם', 'error'); return; }
  try { await DB.addInvestment({ name, type }); showToast('חשבון נוסף בהצלחה'); document.getElementById('modal-inv-name').value = ''; bootstrap.Modal.getOrCreateInstance(document.getElementById('addInvestmentModal')).hide(); loadSavings(); }
  catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
}

async function deleteInvestment(id, name) {
  showConfirm(`למחוק את חשבון "${name}"?`, async () => {
    try { await DB.deleteInvestment(id); showToast('החשבון נמחק'); loadSavings(); }
    catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
  });
}

function openDepositModal(invId) {
  document.getElementById('deposit-inv-id').value = invId;
  document.getElementById('deposit-date').value = new Date().toISOString().slice(0, 7);
  document.getElementById('deposit-amount').value = '';
  document.getElementById('deposit-notes').value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('depositModal')).show();
}

async function saveDeposit() {
  const invId = document.getElementById('deposit-inv-id').value;
  const data = { date: document.getElementById('deposit-date').value, amount: parseFloat(document.getElementById('deposit-amount').value) || 0, notes: document.getElementById('deposit-notes').value };
  if (!data.amount) { showToast('נא להזין סכום', 'error'); return; }
  try { await DB.addDeposit(invId, data); showToast('הפקדה נוספה'); bootstrap.Modal.getOrCreateInstance(document.getElementById('depositModal')).hide(); loadSavings(); }
  catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
}

async function deleteDeposit(invId, depId) {
  showConfirm('למחוק הפקדה זו?', async () => {
    try { await DB.deleteDeposit(invId, depId); showToast('הפקדה נמחקה'); loadSavings(); }
    catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
  });
}

function openYearlyModal(invId) {
  document.getElementById('yearly-inv-id').value = invId;
  document.getElementById('yearly-year').value = new Date().getFullYear();
  document.getElementById('yearly-deposited').value = '';
  document.getElementById('yearly-balance').value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('yearlyModal')).show();
}

async function saveYearly() {
  const invId = document.getElementById('yearly-inv-id').value;
  const data = { year: parseInt(document.getElementById('yearly-year').value), total_deposited: parseFloat(document.getElementById('yearly-deposited').value) || 0, end_balance: parseFloat(document.getElementById('yearly-balance').value) || 0 };
  if (!data.year) { showToast('נא להזין שנה', 'error'); return; }
  try { await DB.addYearly(invId, data); showToast('נתון שנתי נשמר'); bootstrap.Modal.getOrCreateInstance(document.getElementById('yearlyModal')).hide(); loadSavings(); }
  catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
}

function openLoanModal() {
  document.getElementById('modal-loan-person').value = '';
  document.getElementById('modal-loan-amount').value = '';
  document.getElementById('modal-loan-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('modal-loan-notes').value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('addLoanModal')).show();
}

async function addLoanFromModal() {
  const person = document.getElementById('modal-loan-person').value.trim();
  const amount = parseFloat(document.getElementById('modal-loan-amount').value) || 0;
  const date_given = document.getElementById('modal-loan-date').value;
  const notes = document.getElementById('modal-loan-notes').value;
  if (!person || !amount) { showToast('נא למלא שם וסכום', 'error'); return; }
  try { await DB.addLoan({ person, total_given: amount, date_given, notes }); showToast('הלוואה נוספה'); bootstrap.Modal.getOrCreateInstance(document.getElementById('addLoanModal')).hide(); loadSavings(); }
  catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
}

async function addLoan() {
  const person = document.getElementById('new-loan-person').value.trim();
  const amount = parseFloat(document.getElementById('new-loan-amount').value) || 0;
  const date_given = document.getElementById('new-loan-date').value;
  const notes = document.getElementById('new-loan-notes').value;
  if (!person || !amount) { showToast('נא למלא שם וסכום', 'error'); return; }
  try {
    await DB.addLoan({ person, total_given: amount, date_given, notes });
    showToast('הלוואה נוספה');
    document.getElementById('new-loan-person').value = '';
    document.getElementById('new-loan-amount').value = '';
    document.getElementById('new-loan-date').value = '';
    document.getElementById('new-loan-notes').value = '';
    loadSavings();
  } catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
}

async function deleteLoan(id, person) {
  showConfirm(`למחוק הלוואה ל-"${person}"?`, async () => {
    try { await DB.deleteLoan(id); showToast('הלוואה נמחקה'); loadSavings(); }
    catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
  });
}

function openLoanPaymentModal(loanId) {
  document.getElementById('loan-payment-loan-id').value = loanId;
  document.getElementById('loan-payment-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('loan-payment-amount').value = '';
  document.getElementById('loan-payment-notes').value = '';
  bootstrap.Modal.getOrCreateInstance(document.getElementById('loanPaymentModal')).show();
}

async function saveLoanPayment() {
  const loanId = document.getElementById('loan-payment-loan-id').value;
  const data = { date: document.getElementById('loan-payment-date').value, amount: parseFloat(document.getElementById('loan-payment-amount').value) || 0, notes: document.getElementById('loan-payment-notes').value };
  if (!data.amount) { showToast('נא להזין סכום', 'error'); return; }
  try { await DB.addLoanPayment(loanId, data); showToast('תשלום נוסף'); bootstrap.Modal.getOrCreateInstance(document.getElementById('loanPaymentModal')).hide(); loadSavings(); }
  catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
}

async function deleteLoanPayment(loanId, payId) {
  showConfirm('למחוק תשלום זה?', async () => {
    try { await DB.deleteLoanPayment(loanId, payId); showToast('תשלום נמחק'); loadSavings(); }
    catch (e) { showToast('שגיאה: ' + e.message, 'error'); }
  });
}
