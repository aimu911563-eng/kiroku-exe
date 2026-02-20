console.log('main.tsが読み込まれた');

export type LeaveFormPayload = {
  employeeId: string;
  employeeName: string;
  leaveType: '有給' | '欠勤' | '代休' | '特別休暇';
  date: string;
  contact?: string;
  reason?: string;
  submittedAt: string; // ISO
};

// ===== 要素取得 =====
const form = document.getElementById('leaveForm') as HTMLFormElement;
const preview = document.getElementById('preview') as HTMLPreElement;
const dateInput = document.getElementById('date') as HTMLInputElement;
const leaveType = document.getElementById('leaveType') as HTMLSelectElement;
const paidInfo = document.getElementById('paidInfo') as HTMLElement;

// ログインフォーム側
const loginForm = document.getElementById('loginForm') as HTMLFormElement;
const loginEmployeeId = document.getElementById('loginEmployeeId') as HTMLInputElement;
const loginPinInput = document.getElementById('loginPin') as HTMLInputElement;
const submitMessage = document.getElementById('submitMessage') as HTMLDivElement;

// フォーム側（ログイン後に値を入れる欄）
const employeeIdInput = document.getElementById('employeeId') as HTMLInputElement;
const employeeNameInput = document.getElementById('employeeName') as HTMLInputElement;

// 有給表示
const paidGivenEl = document.getElementById('paidGiven')!;
const paidUsedEl = document.getElementById('paidUsed')!;
const paidRemainEl = document.getElementById('paidRemain')!;
const paidRemainAfterEl = document.getElementById('paidRemainAfter')!;
const nextGrantEl = document.getElementById('nextGrant') as HTMLElement;


// 履歴
const historyContainer = document.getElementById('history') as HTMLElement;

// import { API_BASE } from './config';

export const API_BASE = 
  import.meta.env.PROD 
     ? "/api/leaves"
     :"http://localhost:8787/api/leaves"

// ===== 取得日：今日以降しか選べないように =====
if (!dateInput) {
  throw new Error('日付入力の要素が見つかりません');
}

const today = new Date();
const yyyy = today.getFullYear();
const mm = String(today.getMonth() + 1).padStart(2, '0');
const dd = String(today.getDate()).padStart(2, '0');
const todayStr = `${yyyy}-${mm}-${dd}`;
dateInput.min = todayStr;
if (!dateInput.value) {
  dateInput.value = todayStr;
}

// ===== 従業員ログイン処理 =====
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const id = loginEmployeeId.value.trim();
  const pin = loginPinInput.value.trim();

  if (!id || !pin) {
    showToast('error', '従業員番号と暗証番号を入力してください');
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId: id, pin }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        showToast('error', '暗証番号が違います');
      } else if (res.status === 404) {
        showToast('error', '従業員が見つかりません');
      } else {
        showToast('error', 'ログインに失敗しました');
      }
      return;
    }

    const data = await res.json();

    // フォームに反映
    employeeIdInput.value = data.employeeId;
    employeeNameInput.value = data.employeeName;

    // 有給情報
    if (data.baseGrantDate) {
      const base = new Date(data.baseGrantDate);
      const next = new Date(base);
      next.setFullYear(base.getFullYear() + 1);

      const yyyy = next.getFullYear();
      const mm = String(next.getMonth() + 1).padStart(2, '0');
      const dd = String(next.getDate()).padStart(2, '0');

      const formatted = `${yyyy}/${mm}/${dd}`;
      document.getElementById('nextGrant')!.textContent = formatted;
    } else {
      document.getElementById('nextGrant')!.textContent = '-';
    }

    paidGivenEl.textContent = `${data.paidGiven} 日`;
    paidUsedEl.textContent = `${data.paidUsed} 日`;
    paidRemainEl.textContent = `${data.paidRemain} 日`;
    paidRemainAfterEl.textContent = `${data.paidRemain} 日`;

    //有給更新日（次回付与日）
    if (data.nextGrantDate) {
      const d = new Date(data.nextGrantDate);
      const formatted = d.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      nextGrantEl.textContent = formatted;
    } else {
      nextGrantEl.textContent = ' -';
    }

    paidInfo.style.display = 'block';

    // 履歴読み込み
    loadHistory(data.employeeId);

    // pin クリア
    loginPinInput.value = '';

    showToast('success', `${data.employeeName} さんでログインしました`);
  } catch (err) {
    console.error(err);
    showToast('error', '通信エラーが発生しました');
  }
});

// ===== 取得日変更時：有給残りのプレビュー =====
dateInput.addEventListener('change', () => {
  if (leaveType.value !== '有給') {
    paidRemainAfterEl.textContent = paidRemainEl.textContent || '0 日';
    return;
  }

  const remain = parseInt(paidRemainEl.textContent || '0', 10);

  if (remain <= 0) {
    showToast('error', '有給の残りがありません');
    paidRemainAfterEl.textContent = '0 日';
    return;
  }

  const after = remain - 1;
  paidRemainAfterEl.textContent = `${after} 日`;
});

// ===== submitMessage 用（今は使ってないけど一応残す）=====
function showSubmitMessage(
  type: 'success' | 'error',
  message: string
) {
  if (!submitMessage) return;

  submitMessage.textContent = message;
  submitMessage.classList.remove('success', 'error');

  if (type === 'success') {
    submitMessage.classList.add('success');
  } else {
    submitMessage.classList.add('error');
  }
}

// ===== 区分が有給のときだけ有給情報を表示 =====
leaveType.addEventListener('change', () => {
  if (leaveType.value === '有給') {
    paidInfo.style.display = 'block';
  } else {
    paidInfo.style.display = 'none';
    paidRemainAfterEl.textContent = paidRemainEl.textContent || '';
  }
});

// ===== （今は未使用）日数計算：連日取得対応用 =====
function dateDiffInclusive(start: string, end: string): number {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const diff = (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24);
  return Math.floor(diff) + 1; // 同日なら 1
}

// ===== 送信用ペイロード作成 =====
function buildPayload(fd: FormData): LeaveFormPayload {
  const date = String(fd.get('date') || '');

  return {
    employeeId: String(fd.get('employeeId') || ''),
    employeeName: String(fd.get('employeeName') || ''),
    leaveType: String(fd.get('leaveType') || '有給') as LeaveFormPayload['leaveType'],
    date,
    contact: String(fd.get('contact') || ''),
    reason: String(fd.get('reason') || ''),
    submittedAt: new Date().toISOString(),
  };
}

// ===== プレビュー表示 =====
function updatePreview() {
  const fd = new FormData(form);
  const payload = buildPayload(fd);
  preview.textContent = JSON.stringify(payload, null, 2);
}

form.addEventListener('input', updatePreview);

// ===== 申請送信 =====
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const payload = buildPayload(fd);

  // 必須チェック
  if (!payload.employeeId || !payload.employeeName) {
    alert('従業員番号と氏名は必須です');
    return;
  }
  if (!payload.date) {
    alert('取得日を入力してください');
    return;
  }

  if (payload.leaveType === '有給') {
    const remain = parseInt(paidRemainEl.textContent || '0', 10);
    if (remain <= 0) {
      alert('有給の残りがありません');
      return;
    }
  }

  const btn = document.getElementById('submitBtn') as HTMLButtonElement;
  btn.disabled = true;
  const before = btn.textContent;
  btn.textContent = '送信中…';

  console.log('[leave:submit]', payload);

  try {
    const res = await fetch(`${API_BASE}/leaves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({} as any));
      const msg = err.error || err.message || '送信に失敗しました';
      throw new Error(msg);
    }

    const result = await res.json();
    showToast(
      'success',
      `✅ 申請を受け付けました。\n承認後に有給残日数へ反映されます。\n申請ID: ${result.id}`
    );
    form.reset();
    updatePreview();

    // サーバーから残り日数が返ってきたら反映
    if (result.balance) {
      const b = result.balance;
      paidGivenEl.textContent = `${b.paidGiven} 日`;
      paidUsedEl.textContent = `${b.paidUsed} 日`;
      paidRemainEl.textContent = `${b.paidRemain} 日`;
      paidRemainAfterEl.textContent = `${b.paidRemain} 日`;
    }

    if (employeeIdInput.value) {
      loadHistory(employeeIdInput.value);
    }
  } catch (err: any) {
    console.error(err);
    showToast('error', err.message || '送信に失敗しました');
  } finally {
    btn.disabled = false;
    btn.textContent = before || '送信';
  }
});

// ===== 申請履歴まわり =====
type LeaveHistoryItem = {
  id: string;
  employee_id: string;
  employee_name: string;
  leave_type: string;
  date: string;
  submitted_at: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
};

let historyItemsCache: LeaveHistoryItem[] = [];
let currentHistoryFilter: 'all' | 'pending' | 'approved' | 'rejected' = 'all';
let currentHistorySort: 'desc' | 'asc' = 'desc';

// 履歴描画
function renderHistory(
  filter: 'all' | 'pending' | 'approved' | 'rejected' = 'all'
) {
  if (!historyContainer) return;

  const filtered =
    filter === 'all'
      ? historyItemsCache
      : historyItemsCache.filter((item) => item.status === filter);

  if (!filtered.length) {
    historyContainer.innerHTML =
      '<div class="history-empty">まだ申請履歴はありません</div>';
    return;
  }

  const sorted = filtered.slice().sort((a, b) => {
    const aTime = new Date(a.date + 'T00:00:00').getTime();
    const bTime = new Date(b.date + 'T00:00:00').getTime();
    return currentHistorySort === 'desc' ? bTime - aTime : aTime - bTime;
  });

  const html = sorted
    .map((item) => {
      const submitted = new Date(item.submitted_at);
      const submittedStr = submitted.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

      const rawReason = (item.reason || '').trim();
      const reason = rawReason || '（理由未入力）';

      const statusLabel =
        item.status === 'approved'
          ? '承認済'
          : item.status === 'rejected'
          ? '却下'
          : '承認待ち';

      const statusClass =
        item.status === 'approved'
          ? 'status-approved'
          : item.status === 'rejected'
          ? 'status-rejected'
          : 'status-pending';

      const itemClass =
        item.status === 'approved'
          ? 'history-approved'
          : item.status === 'rejected'
          ? 'history-rejected'
          : 'history-pending';

      const reasonLabel = item.status === 'rejected' ? '却下理由' : '理由';
      const reasonClass =
        item.status === 'rejected'
          ? 'history-reason is-rejected'
          : 'history-reason';

      return `
        <article class="history-item ${itemClass}">
          <div class="history-header">
            <span class="badge" data-type="${item.leave_type}">
              ${item.leave_type}
            </span>
            <span class="history-date">${item.date}</span>
            <span class="history-status ${statusClass}">
              ${statusLabel}
            </span>
          </div>
          <div class="history-body">
            <div class="${reasonClass}">${reasonLabel}: ${reason}</div>
            <div class="history-meta">申請日時: ${submittedStr}</div>
          </div>
        </article>
      `;
    })
    .join('');

  historyContainer.innerHTML = html;
}

// 履歴読み込み
async function loadHistory(employeeId: string) {
  if (!historyContainer) return;

  historyContainer.innerHTML =
    '<div class="history-empty">読み込み中…</div>';

  try {
    const res = await fetch(
      `${API_BASE}/?employeeId=${encodeURIComponent(employeeId)}`
    );

    if (!res.ok) {
      historyContainer.innerHTML =
        '<div class="history-empty">履歴の取得に失敗しました</div>';
      return;
    }

    const json = await res.json();
    console.log('[history] raw json', json);

    let items: LeaveHistoryItem[] = [];

    if (Array.isArray(json)) {
      items = json as LeaveHistoryItem[];
    } else if (Array.isArray(json.items)) {
      items = json.items;
    } else if (Array.isArray(json.item)) {
      items = json.item;
    } else if (Array.isArray(json.data)) {
      items = json.data;
    }

    historyItemsCache = items;

    if (!historyItemsCache.length) {
      historyContainer.innerHTML =
        '<div class="history-empty">まだ申請履歴はありません</div>';
      return;
    }

    renderHistory(currentHistoryFilter);
  } catch (err) {
    console.error(err);
    historyContainer.innerHTML =
      '<div class="history-empty">履歴の取得中にエラーが発生しました</div>';
  }
}

// ===== トースト表示 =====
function showToast(kind: 'success' | 'error', msg: string) {
  const el = document.getElementById('toast')!;
  el.className = ''; // リセット
  el.classList.add(kind === 'success' ? 'success' : 'error', 'show');
  el.textContent = msg;

  setTimeout(() => {
    el.className = '';
    el.style.display = 'none';
  }, 2000);

  el.style.display = 'block';
}

// ===== 履歴フィルタ & ソートボタン =====
const historyFilterButtons =
  document.querySelectorAll<HTMLButtonElement>('.history-filter');

historyFilterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const status = btn.dataset.status as
      | 'all'
      | 'pending'
      | 'approved'
      | 'rejected'
      | undefined;

    if (!status) return;

    currentHistoryFilter = status;

    historyFilterButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    renderHistory(currentHistoryFilter);
  });
});

const historySortButtons =
  document.querySelectorAll<HTMLButtonElement>('.history-sort');

historySortButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const order = btn.dataset.order as 'asc' | 'desc' | undefined;
    if (!order) return;

    currentHistorySort = order;

    historySortButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    renderHistory(currentHistoryFilter);
  });
});

// ===== 初期プレビュー =====
updatePreview();
