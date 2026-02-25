

console.log('admin.ts が読み込まれた');

// =========================
// 型定義
// =========================

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

// 有給マスタ用
type LeaveBalanceItem = {
  employeeId: string;
  employeeName: string;
  paidGiven: number;
  paidUsed: number;
};

type AdminLeaveItem = LeaveHistoryItem;

// import { API_BASE } from './config';
export const API_BASE = "/api/leaves";  //管理画面はleavesRoutes配下にいるため　今後整ええる

// =========================
// DOM 取得
// =========================

// 申請一覧
const adminList = document.getElementById('adminList') as HTMLElement | null;
const adminReloadBtn = document.getElementById('adminReloadBtn') as HTMLButtonElement | null;
const adminFilterEmployeeId = document.getElementById('adminFilterEmployeeId') as HTMLInputElement | null;
const adminFilterType = document.getElementById('adminFilterType') as HTMLSelectElement | null;
const adminPendingList = document.getElementById('pendingList') as HTMLElement | null;
const adminHistoryList = document.getElementById('historyList') as HTMLElement | null;

// CSV
const adminCsvBtn = document.getElementById('adminCsvBtn') as HTMLButtonElement | null;
const adminExportCsvBtn = document.getElementById('adminExportCsvBtn') as HTMLButtonElement | null;

// タブ・並び替え
const adminTabs = document.querySelectorAll<HTMLButtonElement>('.tab');
const adminSortButtons = document.querySelectorAll<HTMLButtonElement>('.admin-sort');

// 有給マスタ
const balanceList = document.getElementById('balanceList') as HTMLElement | null;
const balanceReloadBtn = document.getElementById('balanceReloadBtn') as HTMLButtonElement | null;

// 管理者ログイン
const adminLoginBtn = document.getElementById('adminLoginBtn') as HTMLButtonElement | null;
const adminPassInput = document.getElementById('adminPass') as HTMLInputElement | null;
const adminLoginStatus = document.getElementById('adminLoginStatus') as HTMLElement | null;

console.log('[adminLogin] elements:', { adminLoginBtn, adminPassInput });


// =========================
// 状態
// =========================

let currentAdminTab: 'pending' | 'history' = 'pending';
let currentAdminSort: 'asc' | 'desc' = 'desc';

let adminItemCache: AdminLeaveItem[] = [];


// =========================
// 共通ユーティリティ
// =========================

// Toast 表示
function showToast(kind: 'success' | 'error', msg: string) {
  const el = document.getElementById('toast');
  if (!el) return;

  el.className = '';
  el.classList.add(kind === 'success' ? 'success' : 'error', 'show');
  el.textContent = msg;

  setTimeout(() => {
    el.className = '';
    (el as HTMLElement).style.display = 'none';
  }, 2000);

  (el as HTMLElement).style.display = 'block';
}

function validateBalance(paidGiven: number, paidUsed: number): string | null {
  const maxDays = 40;

  if (!Number.isFinite(paidGiven) || !Number.isFinite(paidUsed)) {
    return '数字を入力してください。';
  }
  if (paidGiven < 0 || paidUsed < 0) {
    return '付与日数・使用済日数は 0 以上を入力してください。';
  }
  if (paidGiven > maxDays) {
    return `付与日数は最大 ${maxDays} 日までです。`;
  }
  if (paidUsed > paidGiven) {
    return '使用済日数が付与日数を超えています。';
  }

  const remain = paidGiven - paidUsed;
  if (remain > maxDays) {
    return `残り日数が ${maxDays} 日を超えています。入力内容を確認してください。`;
  }

  return null; // 問題なし
}


// 管理者ログイン状態
function isAdminLoggedIn(): boolean {
  return !!localStorage.getItem('adminToken');
}

// 管理者用 Authorization ヘッダー
function getAdminAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('adminToken');
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

// 今どのステータスで絞るか（タブに応じて）
function getAdminStatusQuery(): 'pending' | 'all' {
  return currentAdminTab === 'pending' ? 'pending' : 'all';
}


// =========================
// 管理者ログイン UI
// =========================

function updateAdminLoginUI() {
  const loggedIn = isAdminLoggedIn();

  if (adminLoginStatus) {
    adminLoginStatus.textContent = loggedIn
      ? '🔓 '    //ログイン中
      : '🔒';  //未ログイン
  }

  // ボタンの制御
  if (adminReloadBtn) adminReloadBtn.disabled = !loggedIn;
  if (adminExportCsvBtn) adminExportCsvBtn.disabled = !loggedIn;
  if (adminCsvBtn) adminCsvBtn.disabled = !loggedIn;
  if (balanceReloadBtn) balanceReloadBtn.disabled = !loggedIn;

  // タブもログインしてないと触れない
  adminTabs.forEach((t) => {
    t.disabled = !loggedIn;
  });

  // ログアウト状態なら一覧をクリア
  if (!loggedIn) {
    if (adminList) {
      adminList.innerHTML =
        '<div class="admin-empty">管理者ログインが必要です</div>';
    }
    if (balanceList) {
      balanceList.innerHTML =
        '<div class="admin-empty">管理者ログインが必要です</div>';
    }
  }
}

//401(unauthorized)の時の共通処理
function handleAdminUnauthorized (res:Response): boolean {
    if (res.status !== 401) return false;

    //トークン破棄＆UI更新
    localStorage.removeItem('adminToken');
    updateAdminLoginUI();

    showToast('error','管理者ログインの有効期限が切れました。\nもう一度ログインしな直してください。');

    return true;
}


// =========================
// 管理者ログイン処理
// =========================

if (adminLoginBtn && adminPassInput) {
  adminLoginBtn.addEventListener('click', async () => {
    const password = adminPassInput.value.trim();

    if (!password) {
      alert('パスワードを入力してください');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        alert('パスワードが違います');
        return;
      }

      const data = await res.json();
      localStorage.setItem('adminToken', data.token);

      updateAdminLoginUI();
      showToast('success', '管理者としてログインしました');

      await loadAdminLeaves();
      await loadBalances();
    } catch (err) {
      console.error(err);
      alert('通信エラーが発生しました');
    }
  });
}


// =========================
// 申請一覧の取得・表示
// =========================

async function loadAdminLeaves() {
  if (!adminList) {
    console.warn('[admin] adminList element not found');
    return;
  }

  if (!isAdminLoggedIn()) {
    adminList.innerHTML =
      '<div class="admin-empty">管理者ログインが必要です</div>';
    showToast('error', '管理者としてログインしてください');
    return;
  }

  adminList.innerHTML = '<div class="admin-empty">読み込み中…</div>';

  const params = new URLSearchParams();

  if (adminFilterEmployeeId && adminFilterEmployeeId.value.trim()) {
    params.set('employeeId', adminFilterEmployeeId.value.trim());
  }
  if (adminFilterType && adminFilterType.value) {
    params.set('leaveType', adminFilterType.value);
  }

  params.set('status', getAdminStatusQuery());

  let url = `${API_BASE}/admin/leaves`;
  const qs = params.toString();
  if (qs) url += `?${qs}`;

  try {
    const res = await fetch(url, {
      headers: {
        ...getAdminAuthHeader(),
      },
    });

    if (!res.ok) {
        //401　ならログイン切れ扱い
        if (handleAdminUnauthorized(res)) {
            adminList.innerHTML = '<div class="admin-empty">管理者ログインが必要です</div>';
            return;
        }

        adminList.innerHTML = '<div class="admin-empty">申請一覧の取得に失敗しました</div>';
        return;
    }

    const json = await res.json();
    let items: AdminLeaveItem[] = Array.isArray(json.items) ? json.items : [];

    if (!items.length) {
      adminList.innerHTML =
        '<div class="admin-empty">該当する申請はありません</div>';
      adminItemCache = [];
      return;
    }

    // 並び替え
    items.sort((a, b) => {
      const aTime = new Date(a.submitted_at).getTime();
      const bTime = new Date(b.submitted_at).getTime();
      return currentAdminSort === 'desc' ? bTime - aTime : aTime - bTime;
    });

    // CSV 用にも保持しておく
    adminItemCache = items.slice();

    const html = items
      .map((item) => {
        const submitted = new Date(item.submitted_at);
        const submittedStr = submitted.toLocaleString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        const reason = (item.reason || '').trim() || '（理由未入力）';

        const statusLabel =
          item.status === 'approved'
            ? '承認済'
            : item.status === 'rejected'
            ? '却下'
            : '承認待ち';

        const isPending = item.status === 'pending';

        return `
          <div class="admin-item" data-id="${item.id}">
            <div class="admin-item-header">
              <span class="admin-badge" data-type="${item.leave_type}">
                ${item.leave_type}
              </span>
              <span class="admin-status" data-status="${item.status}">
                ${statusLabel}
              </span>
              <span class="admin-employee">
                ${item.employee_name}（${item.employee_id}）
              </span>
            </div>
            <div class="admin-meta">
              取得日: ${item.date}<br />
              申請日時: ${submittedStr}
            </div>
            <div class="admin-reason">
              理由: ${reason}
            </div>
            ${
              isPending
                ? `
            <div class="admin-actions">
              <button type="button" class="admin-action" data-status="approved">
                承認
              </button>
              <button type="button" class="admin-action ghost" data-status="rejected">
                却下
              </button>
            </div>
            `
                : ''
            }
          </div>
        `;
      })
      .join('');

    adminList.innerHTML = html;

    // 承認 / 却下 ボタン
    const actionButtons =
      adminList.querySelectorAll<HTMLButtonElement>('.admin-action');

    actionButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const parent = btn.closest('.admin-item') as HTMLElement | null;
        if (!parent) return;

        const id = parent.getAttribute('data-id');
        const status = btn.getAttribute(
          'data-status'
        ) as 'approved' | 'rejected' | null;

        const leaveType = parent
          .querySelector('.admin-badge')
          ?.textContent?.trim();

        if (!id || !status) return;

        // 承認
        if (status === 'approved') {
          if (!confirm('この申請を承認しますか？')) return;
        }

        // 却下（有給だけ法律の注意）
        if (status === 'rejected') {
          const message =
            leaveType === '有給'
              ? `【⚠ 法律上の確認】

有給休暇は労働基準法により
原則、会社は拒否できません（労基法39条）。

「人手不足」「忙しい」は
時季変更の理由には原則なりません。

ただし
・事業の正常な運営を妨げる場合に限り
・「時季変更権」として
・別日への変更は可能です。

【最終確認】
それでも「却下」で処理してよろしいですか？`
              : 'この申請を却下しますか？';

          if (!confirm(message)) return;

          const rejectReason = prompt('却下理由を入力してください（必須）');

          if (!rejectReason || !rejectReason.trim()) {
            showToast('error', '却下には理由が必要です');
            return;
          }

          await updateLeaveStatus(id, status, rejectReason);
          return;
        }

        // 共通（承認）
        try {
          btn.disabled = true;

          const res = await fetch(
            `${API_BASE}/admin/leaves/${encodeURIComponent(id)}/status`,
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', ...getAdminAuthHeader(), },
              body: JSON.stringify({ status }),
            }
          );

          if (!res.ok) {
            showToast('error', 'ステータスの更新に失敗しました');
            return;
          }

          showToast(
            'success',
            status === 'approved' ? '承認しました' : '却下しました'
          );

          await loadAdminLeaves();
        } catch (err) {
          console.error(err);
          showToast('error', '通信エラーが発生しました');
        } finally {
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    console.error(err);
    adminList.innerHTML =
      '<div class="admin-empty">申請一覧の取得中にエラーが発生しました</div>';
  }
}


// =========================
// ステータス更新（承認 / 却下）
// =========================

async function updateLeaveStatus(
  id: string,
  status: 'approved' | 'rejected',
  rejectReason?: string
) {
  const res = await fetch(
    `${API_BASE}/admin/leaves/${encodeURIComponent(id)}/status`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAdminAuthHeader(),
      },
      body: JSON.stringify({ status, rejectReason }),
    }
  );

  if (!res.ok) {
    showToast('error', 'ステータスの更新に失敗しました');
    return;
  }

  if (!res.ok) {
    if (handleAdminUnauthorized(res)) {
        return;
    }

    showToast('error','ステータス更新に失敗しました');
    return;
  }

  showToast(
    'success',
    status === 'approved' ? '承認しました' : '却下しました'
  );

  await loadAdminLeaves();
}


// =========================
// 有給マスタ一覧の取得・更新
// =========================



async function loadBalances() {
  if (!balanceList) return;

  if (!isAdminLoggedIn()) {
    balanceList.innerHTML =
      '<div class="admin-empty">管理者ログインが必要です</div>';
    showToast('error', '管理者としてログインしてください');
    return;
  }

  balanceList.innerHTML = '<div class="admin-empty">読み込み中…</div>';

  try {
    const res = await fetch(`${API_BASE}/admin/balances`, {
      headers: {
        ...getAdminAuthHeader(),
      },
    });

    if (!res.ok) {
        if (handleAdminUnauthorized(res)) {
            balanceList.innerHTML = '<div class="admin-empty">管理者ログインが必要です</div>';
            return;
        }

        balanceList.innerHTML = '<div class="admin-empty">有給マスタの取得に失敗しました</div>';
        return;
    }

    const json = await res.json();
    console.log('[balances] raw json',json);
    
    const rawItems = Array.isArray(json.items) ? json.items : [];

    const items: LeaveBalanceItem[] = rawItems.map((item: any) => ({
        employeeId: item.employeeId ?? item.employee_id ?? '',
        employeeName: item.employeeName ?? item.employee_name ?? '',
        paidGiven: Number(item.paidGiven ?? item.paid_given ?? 0),
        paidUsed: Number(item.paidUsed ?? item.paid_used ?? 0),
    }))

    if (!items.length) {
      balanceList.innerHTML =
        '<div class="admin-empty">登録されている従業員がいません</div>';
      return;
    }

    const html = items
  .map((item) => {
    const remain = item.paidGiven - item.paidUsed;

    return `
      <div class="balance-row" data-id="${item.employeeId}">
          <div class="balance-name">
            <strong>${item.employeeName}</strong>
            <span class="balance-id">（${item.employeeId}）</span>
          </div>
        <div class="balance-fields">
          <div class="balance-field">
              <span class="balance-label">付与</span>
              <input
                type="number"
                class="balance-given"
                min="0"
                value="${item.paidGiven}"
              /> 
              <span class="balance-unit">日</span>
          </div>

          <div class="balance-field">
              <span class="balance-label">使用済</span>
              <input
                type="number"
                class="balance-used"
                min="0"
                value="${item.paidUsed}"
              /> 
              <span class="balance-unit">日</span>
          </div>
        
          <div class="balance-field balance-remain">
              <span class="balance-label">残り</span>
              <strong>${remain}</strong> 
              <span class="balance-unit">日</span>
          </div>
        </div>
          <button type="button" class="balance-save">保存</button>
      </div>
    `;
  })
  .join('');




    balanceList.innerHTML = html;

    // 保存ボタン
    const saveButtons =
      balanceList.querySelectorAll<HTMLButtonElement>('.balance-save');

    saveButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.balance-row') as HTMLElement | null;
        if (!row) return;

        const employeeId = row.dataset.id;
        if (!employeeId) return;

        const givenInput = row.querySelector<HTMLInputElement>('.balance-given');
        const usedInput = row.querySelector<HTMLInputElement>('.balance-used');
        const remainSpan = row.querySelector<HTMLElement>('.balance-remain');

        if (!givenInput || !usedInput || !remainSpan) return;

        const paidGiven = Number(givenInput.value);
        const paidUsed = Number(usedInput.value);

        const errMsg = validateBalance(paidGiven, paidUsed);
        if (errMsg) {
          showToast('error', errMsg);
          return;
        }

        try {
          btn.disabled = true;
          btn.textContent = '保存中…';

          const res = await fetch(
            `${API_BASE}/admin/balances/${encodeURIComponent(employeeId)}`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...getAdminAuthHeader(),
              },
              body: JSON.stringify({ paidGiven, paidUsed }),
            }
          );

          if (!res.ok) {
            showToast('error', '有給マスタの更新に失敗しました');
            return;
          }

          const result = await res.json();
          const newRemain =
            result.item?.paidRemain ?? paidGiven - paidUsed;

          remainSpan.innerHTML = `残り：<strong>${newRemain}</strong> 日`;

          showToast('success', '有給マスタを更新しました');
        } catch (err) {
          console.error(err);
          showToast('error', '通信エラーが発生しました');
        } finally {
          btn.disabled = false;
          btn.textContent = '保存';
        }
      });
    });
  } catch (err) {
    console.error(err);
    balanceList.innerHTML =
      '<div class="admin-empty">有給マスタの取得中にエラーが発生しました</div>';
  }
}


// =========================
// CSV 出力
// =========================

// 画面の条件に合わせて再取得して CSV 出力
async function exportAdminCsv() {
  if (!isAdminLoggedIn()) {
    showToast('error', '管理者としてログインしてください');
    return;
  }

  const params = new URLSearchParams();

  if (adminFilterEmployeeId && adminFilterEmployeeId.value.trim()) {
    params.set('employeeId', adminFilterEmployeeId.value.trim());
  }
  if (adminFilterType && adminFilterType.value) {
    params.set('leaveType', adminFilterType.value);
  }

  params.set('status', getAdminStatusQuery());

  let url = `${API_BASE}/admin/leaves`;
  const qs = params.toString();
  if (qs) url += `?${qs}`;

  try {
    const res = await fetch(url, {
      headers: {
        ...getAdminAuthHeader(),
      },
    });

    if (!res.ok) {
        if (handleAdminUnauthorized(res)) {
            return;
        }

        showToast('error', 'CSV用データの取得に失敗しました');
        return;
    }

    const json = await res.json();
    let items: AdminLeaveItem[] = Array.isArray(json.items) ? json.items : [];

    if (!items.length) {
      showToast('error', '出力対象のデータがありません');
      return;
    }

    items = items.slice().sort((a, b) => {
      const aTime = new Date(a.submitted_at).getTime();
      const bTime = new Date(b.submitted_at).getTime();
      return currentAdminSort === 'desc' ? bTime - aTime : aTime - bTime;
    });

    const header = [
      '申請ID',
      '従業員番号',
      '氏名',
      '区分',
      '取得日',
      '申請日時',
      'ステータス',
      '理由',
    ];

    const rows = items.map((item) => {
      const submitted = new Date(item.submitted_at);
      const submittedStr = submitted.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

      const statusLabel =
        item.status === 'approved'
          ? '承認済'
          : item.status === 'rejected'
          ? '却下'
          : '承認待ち';

      const reason = (item.reason || '').replace(/\r?\n/g, ' ');

      return [
        item.id,
        item.employee_id,
        item.employee_name,
        item.leave_type,
        item.date,
        submittedStr,
        statusLabel,
        reason,
      ];
    });

    const csvLines = [
      header.join(','),
      ...rows.map((cols) =>
        cols
          .map((v) => {
            const s = String(v ?? '');
            if (/[",\r\n]/.test(s)) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(',')
      ),
    ];

    const csvContent = '\uFEFF' + csvLines.join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const urlObj = URL.createObjectURL(blob);

    const a = document.createElement('a');
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');

    a.href = urlObj;
    a.download = `leaves_${currentAdminTab}_${y}${m}${d}_${hh}${mm}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(urlObj);

    showToast('success', 'CSVをダウンロードしました');
  } catch (err) {
    console.error(err);
    showToast('error', 'CSVの作成中にエラーが発生しました');
  }
}

// 旧仕様（adminItemCache から出すやつ）も残したい場合
function downloadAdminCsv() {
  if (!adminItemCache.length) {
    showToast('error', '出力する申請がありません');
    return;
  }

  const header = [
    '申請ID',
    '従業員番号',
    '氏名',
    '区分',
    '取得日',
    '申請日時',
    '理由',
    'ステータス',
  ];

  const rows = adminItemCache.map((item) => {
    const submitted = new Date(item.submitted_at);
    const submittedStr = submitted.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });

    const reason = (item.reason || '').replace(/\r?\n/g, ' ');
    const statusLabel =
      item.status === 'approved'
        ? '承認済'
        : item.status === 'rejected'
        ? '却下'
        : '承認待ち';

    const cols = [
      item.id,
      item.employee_id,
      item.employee_name,
      item.leave_type,
      item.date,
      submittedStr,
      reason,
      statusLabel,
    ];

    return cols
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });

  const csv = [header.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;

  const now = new Date();
  const ts = now.toISOString().slice(0, 10);
  a.download = `leaves_${ts}.csv`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


// =========================
// イベント登録
// =========================

// タブ切り替え（pending / history）
adminTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab as 'pending' | 'history' | undefined;
    if (!tabName) return;

    currentAdminTab = tabName;

    adminTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');

    // 表示切り替え（pendingList / historyList）
    if (adminPendingList && adminHistoryList) {
      if (tabName === 'pending') {
        adminPendingList.classList.remove('hidden');
        adminHistoryList.classList.add('hidden');
      } else {
        adminPendingList.classList.add('hidden');
        adminHistoryList.classList.remove('hidden');
      }
    }

    loadAdminLeaves();
  });
});

// 並び替えボタン
adminSortButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const order = btn.dataset.order as 'asc' | 'desc' | undefined;
    if (!order) return;

    currentAdminSort = order;
    adminSortButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    loadAdminLeaves();
  });
});

// 申請一覧読み込み
adminReloadBtn?.addEventListener('click', () => {
  loadAdminLeaves();
});

// CSV 出力（条件付き）
adminExportCsvBtn?.addEventListener('click', () => {
  exportAdminCsv();
});

// CSV 出力（画面に出ているやつそのまま）
adminCsvBtn?.addEventListener('click', () => {
  downloadAdminCsv();
});

// 有給マスタの再読み込み
balanceReloadBtn?.addEventListener('click', () => {
  loadBalances();
});


// =========================
// 初期化
// =========================

updateAdminLoginUI();

if (isAdminLoggedIn()) {
  // すでにトークンを持っていたら、自動で読み込む
  loadAdminLeaves();
  //loadBalances();
}
