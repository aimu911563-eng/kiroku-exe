export const leaveRoutes = new Hono();

leaveRoutes.get("/view", (c) => {
  // store_idチェックしてJSON返す
  return c.json({ ok: true });
});

// src/server.ts
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { Resend } from 'resend';
import { LeaveFormPayload } from './main';

// const resend = new Resend(process.env.RESEND_API_KEY!);
const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const supabase = createClient (
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

//動作確認用
leaveRoutes.get('/', (c) => c.text('root ok'))
leaveRoutes.get('/api/health',(c) => c.json({ok: true}))

// 環境変数確認
leaveRoutes.get('/api/debug-env', (c) => c.json({
  hasUrl: !!process.env.SUPABASE_URL,
  hasAnon: !!process.env.SUPABASE_ANON_KEY
}));

import { cors } from 'hono/cors';

// これを一番最初の方に追加
leaveRoutes.use(
  '*',
  cors({
    origin: 'https://kiroku-exe.pages.dev',
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// ここから下は今まで通りのルーティング…

// 固定データで DB へ書き込むテスト（問題の切り分け用）
leaveRoutes.post('/api/test-insert', async (c) => {
  const { error } = await supabase.from('leaves').insert({
    employee_id: 'debug-employee',
    employee_name: 'デバッグ 太郎',
    leave_type: '有給',
    date: '2025-11-28',
    submitted_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[test-insert] error:', { message: error.message, details: error.details, hint: error.hint, code: error.code });
    return c.json({ ok: false, error: error.message }, 500);
  }
  return c.json({ ok: true });
});

// 本番のINSERT
leaveRoutes.post("/leaves",async (c) => {
  try {
    const body = await c.req.json().catch(()=> null);
    console.log('[server] raw body:', body);

    if (!body) return c.json({ message: 'invalid JSON' }, 400);

    const { employeeId, employeeName, leaveType, date, contact, reason, submittedAt } = body;

    const missing: string[] = [];
    if (!employeeId) missing.push('employeeID');
    if (!employeeName) missing.push('employeeName');
    if (!date) missing.push('date');
    if (missing.length) {
      console.warn('[server] missing fields',missing);
      return c.json({ message: `missing or invalid fields: ${missing.join(', ')}`}, 400);
    }

    const payload = await c.req.json<LeaveFormPayload>();

    //過去日付チェック
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;

    //今日より前　を弾く
    if (payload.date <= todayStr) {
      return c.json( { error: '過去の日付では申請できません。取得日は本日以降を指定してください。'}, 400)
    }

    const { data, error } = await supabase
      .from('leaves')
      .insert({
        employee_id: employeeId,
        employee_name: employeeName,
        leave_type: leaveType,
        date,
        contact,
        reason,
        submitted_at: submittedAt ?? new Date().toLocaleString(),
        status: 'pending',
      })
      .select('id')
      .single();

    if (error) {
      console.error ('[supabase] insert error:', {
        meassge: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });
      return c.json({ message: 'DB insert failed' }, 500);
    }
    // --- ここからメール送信処理 ---
    const ownerEmail = process.env.OWNER_EMAIL;
    if (ownerEmail && resend) {
      const submittedAtDate = submittedAt
        ? new Date(submittedAt)
        : new Date();

      const submittedStr = submittedAtDate.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });

      try {
        await resend.emails.send({
          from: '休暇申請システム <no-reply@rekokeshimo-tools.site>',
          to: ownerEmail,
          subject: '【休暇申請】新しい申請が届きました',
          html: `
            <h2>新しい休暇申請が届きました</h2>
            <p>従業員:${employeeName} (${employeeId})</p>
            <p>区分:${leaveType}</p>
            <p>取得日:${date}</p>
            <p>理由:${(reason || '').trim() || ' (未入力) '}</p>
            <hr />
            <p>申請日時:${submittedStr}</p>
            <p>申請ID:${data.id}</p>
          `,
        });
      } catch (mailErr: any) {
        console.error('[mail] send failed:', mailErr?.message ?? mailErr);
      } 
      } else {
        console.warn('[mail] OWNER_EMAIL or RESEND_API_KEY is missing; skip sending mail');
    }

    // --- メール送信ここまで ---


    return c.json({
      ok: true,
      id: data.id,
      receivedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error ('[server] unexpected error:', e?.message ?? e);
    return c.json({ message: 'unexpected server error' }, 500)
  }
});

leaveRoutes.get ('/employees/:employeeId', async (c) => {
  const id = c.req.param ('employeeId');

  const { data, error } = await supabase
    .from ('leave_balances')
    .select ('employee_id, employee_name, paid_given, paid_used')
    .eq ('employee_id', id)
    .single();

  if (error || !data) {
    return c.json ({ message: 'not found' }, 404);
  }

  const remain = data.paid_given - data.paid_used;

  return c.json ({
    employeeId: data.employee_id,
    employeeName: data.employee_name,
    paidGiven: data.paid_given,
    paidUsed: data.paid_used,
    paidRemain: remain
  });
});

//申請履歴取得
leaveRoutes.get ("/leaves", async (c) => {
  const employeeId = c.req.query ('employeeId');

  if (!employeeId) {
    return c.json ({ message: 'employeeId is required '}, 400);
  }

  const { data, error } = await supabase
      .from('leaves')
      .select ('id, employee_id, employee_name, leave_type, date, submitted_at, reason, status')
      .eq ('employee_id', employeeId)
      .order ('submitted_at', {ascending: false});
  if (error) {
    console.error ('[supabase] select error:', {
      message: error.message, details: error.details, hint: error.hint, code: error.code,
    });
    return c.json ({ message: 'failed to fetch leaves'}, 500);
  }

  return c.json ({ item: data ?? [] });

})

leaveRoutes.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);

  console.log('[login] body:', body);

  if (!body) {
    return c.json({ message: 'invalid json' }, 400);
  }

  const { employeeId, pin } = body as { employeeId?: string; pin?: string };

  if (!employeeId || !pin) {
    console.log('[login] missing fields:', { employeeId, pin });
    return c.json({ message: 'employeeId and pin are required' }, 400);
  }

  const { data, error } = await supabase
    .from('leave_balances')
    .select('employee_id, employee_name, paid_given, paid_used, pin_code, base_grant_date, next_remind_date')
    .eq('employee_id', employeeId)
    .maybeSingle();  

  console.log('[login] db result:', { data, error });

  if (error) {
    console.error('[login] supabase error:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    return c.json({ message: 'db error' }, 500);
  }

  if (!data) {
    // employee_id が一致するレコードが無い
    return c.json({ message: 'not found' }, 404);
  }

  if (!data.pin_code || data.pin_code !== pin) {
    // PIN が違う
    return c.json({ message: 'invalid pin' }, 401);
  }

  const remain = data.paid_given - data.paid_used;

  return c.json({
    employeeId: data.employee_id,
    employeeName: data.employee_name,
    paidGiven: data.paid_given,
    paidUsed: data.paid_used,
    paidRemain: remain,
    baseGrantDate: data.base_grant_date,
    nextGrantDate: data.next_remind_date,
  });
});

//管理者用：有給残数マスター一覧取得
leaveRoutes.get('/admin/balances', adminGuard, async (c) => {
  const { data, error } = await supabase
    .from('leave_balances')
    .select('employee_id, employee_name, paid_given, paid_used')
    .order( 'employee_id', { ascending: true });

  if (error) {
    console.error('[admin:balances:list] error:', error);
    return c.json({ message: 'balances list failed' }, 500);
  }

  //フロントで残りに日数を扱いしやすいように計算して渡す
  const items = (data ?? []).map((row) => ({
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    paidGiven: row.paid_given,
    paidUsed: row.paid_used,
    paidRemain: row.paid_given - row.paid_used,
  }));

  return c.json({ items });
});

// 👇 オーナー宛てメール用（もう似たのがあればそれを使ってOK）
const OWNER_EMAIL = process.env.OWNER_EMAIL ?? '';

async function sendOwnerMail(subject: string, text: string) {
  if (!OWNER_EMAIL) {
    console.warn('[remind] OWNER_EMAIL が設定されていません');
    return;
  }

  await resend.emails.send({
    from: '休暇申請システム <no-reply@rekokeshimo-tools.site>',
    to: OWNER_EMAIL,
    subject: subject,
    text: text,
  });
}

// 🔽 ここからテスト用エンドポイント
leaveRoutes.get('/test/remind', async (c) => {
  await sendOwnerMail(
    '【テスト】有給リマインドメール',
    [
      'このメールが届いていれば、',
      'sendOwnerMail と Resend の設定はOKです。',
      '',
      'テストなので特に対応は不要です。'
    ].join('\n')
  );

  return c.json({ ok: true });
});
// 🔼 ここまで


/**
 * 有給付与日のリマインド＆催促メール
 * - next_remind_date == 今日 かつ remind_status = idle → 付与日リマインド
 * - next_remind_date <= (今日 - 3日) かつ remind_status = sent → 催促メール
 */
leaveRoutes.post('/admin/check-grant', adminGuard, async (c) => {
  // 🕒 今日の日付（JST前提でざっくり）
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`; // "2025-12-08" みたいな感じ

  // 3日前
  const d3 = new Date(now);
  d3.setDate(d3.getDate() - 3);
  const yyyy3 = d3.getFullYear();
  const mm3 = String(d3.getMonth() + 1).padStart(2, '0');
  const dd3 = String(d3.getDate()).padStart(2, '0');
  const threeDaysAgo = `${yyyy3}-${mm3}-${dd3}`;

  console.log('[grant-check] today =', today, 'threeDaysAgo =', threeDaysAgo);

  // ① 当日リマインド対象
  const { data: toRemind, error: remindErr } = await supabase
    .from('leave_balances')
    .select(
      'employee_id, employee_name, base_grant_date, next_remind_date, remind_status, paid_given, paid_used'
    )
    .eq('next_remind_date', today)
    .in('remind_status', ['idle', null as any]); // null 対策で in を使用

  if (remindErr) {
    console.error('[grant-check] remind fetch error', remindErr);
  }

  let remindCount = 0;
  if (toRemind && toRemind.length > 0) {
    for (const row of toRemind) {
      const remain = row.paid_given - row.paid_used;

      const subject = `【有給付与日】${row.employee_name} さんの有給付与日です`;
      const text = [
        `従業員: ${row.employee_name}（${row.employee_id}）`,
        '',
        `本日は有給の付与日として登録されています。`,
        '',
        `現在の付与日数: ${row.paid_given} 日`,
        `現在の使用済:   ${row.paid_used} 日`,
        `現在の残り:     ${remain} 日`,
        '',
        `管理画面から「付与日数」や「使用済日数」を必要に応じて更新してください。`,
      ].join('\n');

      await sendOwnerMail(subject, text);

      // ステータスを sent に更新
      const { error: updErr } = await supabase
        .from('leave_balances')
        .update({
          remind_status: 'sent',
          updated_at: new Date().toISOString(),
        })
        .eq('employee_id', row.employee_id);

      if (updErr) {
        console.error(
          '[grant-check] update remind_status -> sent error',
          updErr
        );
      } else {
        remindCount++;
      }
    }
  }

  // ② 3日以上経過しても updated されてない人向け催促
  const { data: toNag, error: nagErr } = await supabase
    .from('leave_balances')
    .select(
      'employee_id, employee_name, base_grant_date, next_remind_date, remind_status, paid_given, paid_used'
    )
    .eq('remind_status', 'sent')
    .lte('next_remind_date', threeDaysAgo);

  if (nagErr) {
    console.error('[grant-check] nag fetch error', nagErr);
  }

  let nagCount = 0;
  if (toNag && toNag.length > 0) {
    for (const row of toNag) {
      const subject = `【有給付与の更新未完了】${row.employee_name} さん`;
      const text = [
        `従業員: ${row.employee_name}（${row.employee_id}）`,
        '',
        `有給の付与予定日（${row.next_remind_date}）から3日以上経過していますが、`,
        `「付与日数」「使用済日数」の更新が完了していない可能性があります。`,
        '',
        `管理画面から最新の残数を確認し、必要に応じて更新してください。`,
      ].join('\n');

      await sendOwnerMail(subject, text);

      // ステータスを done に更新（これ以上は催促しない）
      const { error: updErr } = await supabase
        .from('leave_balances')
        .update({
          remind_status: 'done',
          updated_at: new Date().toISOString(),
        })
        .eq('employee_id', row.employee_id);

      if (updErr) {
        console.error(
          '[grant-check] update remind_status -> done error',
          updErr
        );
      } else {
        nagCount++;
      }
    }
  }

  return c.json({
    ok: true,
    reminded: remindCount,
    nagged: nagCount,
  });
});

// ⭐ テスト用：認証なし＆GETで叩けるバージョン
leaveRoutes.get('/test/check-grant', async (c) => {
  // 🕒 今日の日付（JST前提でざっくり）
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const today = `${yyyy}-${mm}-${dd}`; // "2025-12-08" みたいな感じ

  // 3日前
  const d3 = new Date(now);
  d3.setDate(d3.getDate() - 3);
  const yyyy3 = d3.getFullYear();
  const mm3 = String(d3.getMonth() + 1).padStart(2, '0');
  const dd3 = String(d3.getDate()).padStart(2, '0');
  const threeDaysAgo = `${yyyy3}-${mm3}-${dd3}`;

  console.log('[grant-check TEST] today =', today, 'threeDaysAgo =', threeDaysAgo);

  // ① 当日リマインド対象
  const { data: toRemind, error: remindErr } = await supabase
    .from('leave_balances')
    .select(
      'employee_id, employee_name, base_grant_date, next_remind_date, remind_status, paid_given, paid_used'
    )
    .eq('next_remind_date', today)
    .in('remind_status', ['idle', null as any]); // null 対策で in を使用

  if (remindErr) {
    console.error('[grant-check TEST] remind fetch error', remindErr);
  }

  let remindCount = 0;
  if (toRemind && toRemind.length > 0) {
    for (const row of toRemind) {
      const remain = row.paid_given - row.paid_used;

      const subject = `【有給付与日】${row.employee_name} さんの有給付与日です（TEST）`;
      const text = [
        `従業員: ${row.employee_name}（${row.employee_id}）`,
        '',
        `本日は有給の付与日として登録されています。（TEST）`,
        '',
        `現在の付与日数: ${row.paid_given} 日`,
        `現在の使用済:   ${row.paid_used} 日`,
        `現在の残り:     ${remain} 日`,
      ].join('\n');

      await sendOwnerMail(subject, text);

      const { error: updErr } = await supabase
        .from('leave_balances')
        .update({
          remind_status: 'sent',
          updated_at: new Date().toISOString(),
        })
        .eq('employee_id', row.employee_id);

      if (updErr) {
        console.error(
          '[grant-check TEST] update remind_status -> sent error',
          updErr
        );
      } else {
        remindCount++;
      }
    }
  }

  // ② 3日以上経過しても updated されてない人向け催促
  const { data: toNag, error: nagErr } = await supabase
    .from('leave_balances')
    .select(
      'employee_id, employee_name, base_grant_date, next_remind_date, remind_status, paid_given, paid_used'
    )
    .eq('remind_status', 'sent')
    .lte('next_remind_date', threeDaysAgo);

  if (nagErr) {
    console.error('[grant-check TEST] nag fetch error', nagErr);
  }

  let nagCount = 0;
  if (toNag && toNag.length > 0) {
    for (const row of toNag) {
      const subject = `【有給付与の更新未完了】${row.employee_name} さん（TEST）`;
      const text = [
        `従業員: ${row.employee_name}（${row.employee_id}）`,
        '',
        `有給の付与予定日（${row.next_remind_date}）から3日以上経過していますが、`,
        `「付与日数」「使用済日数」の更新が完了していない可能性があります。（TEST）`,
      ].join('\n');

      await sendOwnerMail(subject, text);

      const { error: updErr } = await supabase
        .from('leave_balances')
        .update({
          remind_status: 'done',
          updated_at: new Date().toISOString(),
        })
        .eq('employee_id', row.employee_id);

      if (updErr) {
        console.error(
          '[grant-check TEST] update remind_status -> done error',
          updErr
        );
      } else {
        nagCount++;
      }
    }
  }

  return c.json({
    ok: true,
    reminded: remindCount,
    nagged: nagCount,
  });
});


//管理者用：有給残数マスタの更新
leaveRoutes.put('/admin/balances/:employeeId', adminGuard, async (c) => {
  const employeeId = c.req.param('employeeId');
  const body = await c.req.json().catch(() => null);

  if (!body) {
    return c.json({ message: 'invalid json' }, 400);
  }

  const paidGiven = Number(body.paidGiven);
  const paidUsed = Number(body.paidUsed);

  if (!Number.isFinite(paidGiven) || !Number.isFinite(paidUsed)) {
    return c.json({ message: 'invalid numbers' }, 400);
  }
  if (paidGiven < 0 || paidUsed < 0) {
    return c.json({ message: 'must be >= 0' }, 400);
  } 
  if (paidUsed > paidGiven) {
    return c.json({ message: 'paidUsed cannot exceed paidGiven' }, 400);
  }

  const maxDays = 40

  if (paidGiven < 0 || paidGiven > maxDays) {
    return c.json({ message: '付与数が不正です' }, 400);
  }

  if (paidUsed < 0 || paidUsed > paidGiven) {
    return c.json({ message: '使用済み日数が不正です' }, 400);
  }

  const remains = paidGiven - paidUsed;
  if (remains < 0 || remains > maxDays) {
    return c.json({ message: '残り日数が不正です' }, 400);
  }

  const { data, error } = await supabase
    .from('leave_balances')
    .update({
      paid_given: paidGiven,
      paid_used: paidUsed,
      updated_at: new Date().toISOString(),
    })
    .eq('employee_id', employeeId)
    .select('employee_id, paid_given, paid_used')
    .single();

  if (error) {
    console.error('[admin:balances:update] error:', error);
    return c.json({ message: 'update failed' }, 500);
  }

  const remain = data.paid_given - data.paid_used;

  return c.json({
    employeeId: data.employee_id,
    paidGiven: data.paid_given,
    paidUsed: data.paid_used,
    paidRemain: remain,
  });
});

import { sign, verify } from 'hono/jwt';
import { count } from 'console';
//管理ログイン
leaveRoutes.post('/admin/login', async (c) => {
  const { password } = await c.req.json<{ password: string }>();

  if (password !== process.env.ADMIN_PASSWORD) {
    return c.json({ error: 'パスワードが違います' },401);
  }
  const token = await sign(
     { role: 'admin' },
     process.env.ADMIN_TOKEN_SECRET!
  );

  return c.json({ token });
});

//管理者用API（承認・却下・CSVなど）すべてにこれをかける
async function adminGuard(c: any, next: any) {
  const auth = c.req.header('Authorization');

  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: '認証が必要です' }, 401);
  }

  const token = auth.replace('Bearer ', '');

  try {
    const payload = await verify(token, process.env.ADMIN_TOKEN_SECRET!);
    if (payload.role !== 'admin') throw new Error('not admin');
    await next();
  } catch {
    return c.json({ error: '認証エラー' }, 401);
  }
}

leaveRoutes.post('/admin/approve', adminGuard, async (c) => {
  // 承認処理
});

leaveRoutes.post('/admin/reject', adminGuard, async (c) => {
  // 却下処理
});

leaveRoutes.get('/admin/csv', adminGuard, async (c) => {
  // CSV処理
});

// 管理者用：有給マスタ一覧
leaveRoutes.get('/admin/balances', adminGuard, async (c) => {
  const { data, error } = await supabase
    .from('leave_balances')
    .select('employee_id, employee_name, paid_given, paid_used')
    .order('employee_id', { ascending: true });

  if (error) {
    console.error('[admin:balances:list] error:', error);
    return c.json({ message: 'balance list failed' }, 500);
  }

  return c.json({ items: data ?? [] });
});

// 管理者用：有給マスタ更新
leaveRoutes.patch('/admin/balances/:employeeId', adminGuard, async (c) => {
  const employeeId = c.req.param('employeeId');
  const body = await c.req.json().catch(() => null) as
    | { paidGiven?: number; paidUsed?: number }
    | null;

  if (!body) {
    return c.json({ message: 'invalid json' }, 400);
  }

  const updates: any = {};

  if (typeof body.paidGiven === 'number') {
    updates.paid_given = body.paidGiven;
  }
  if (typeof body.paidUsed === 'number') {
    updates.paid_used = body.paidUsed;
  }

  if (!Object.keys(updates).length) {
    return c.json({ message: 'no fields to update' }, 400);
  }

  updates.updated_at = new Date().toISOString();
  updates.remind_status = 'done';

  const { data, error } = await supabase
    .from('leave_balances')
    .update(updates)
    .eq('employee_id', employeeId)
    .select('employee_id, employee_name, paid_given, paid_used')
    .single();

  if (error) {
    console.error('[admin:balances:update] error:', error);
    return c.json({ message: 'balance update failed' }, 500);
  }

  return c.json({
    ok: true,
    item: {
      employeeId: data.employee_id,
      employeeName: data.employee_name,
      paidGiven: data.paid_given,
      paidUsed: data.paid_used,
      paidRemain: data.paid_given - data.paid_used,
    },
  });
});

//// 例: /api/admin/remind-balances を叩くと、今日リマインド対象の人についてメール送信
leaveRoutes.post('/admin/remind-balances', adminGuard, async (c) => {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const today = new Date().toISOString().slice(0, 10); //YYYY-MM-DD

  // next_remind_date が今日以前 & remind_status != 'done' の人を探す
  const { data, error } = await supabase
    .from('leave_balances')
    .select('employee_id, employee_name, base_grant_date, next_remind_date, remind_status')
    .lte('next_remind_date', today)
    .neq('remind_status', 'done');

  if (error) {
    console.error(error);
    return c.json({message: 'リマインド対象はありません', count: 0});
  }

  // ここでメール本文を組み立てて Resend でオーナーに送信
  // ※ ownerEmail は .env から取る想定
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) {
    return c.json({ error: 'OWNER_EMAIL が設定されていません'}, 500);
  }

  const lines = data.map((row) => {
    return  `・${row.employee_name}（${row.employee_id}）: 付与基準日 ${row.base_grant_date}`;
  });

  const textBody = [
    '有給付与の更新が必要な従業員がいます。',
    '',
    ...lines,
    '',
    '管理画面の「有給マスタ管理」から、付与日数を更新してください。',
  ].join('\n');

  await resend.emails.send({
    from: '休暇申請システム <no-reply@rekokeshimo-tools.site>',
    to: ownerEmail,
    subject: '【有給付与リマインド】更新が必要な従業員がいます',
    text: textBody,
  });

  //次回リマインド日を3日後にずらすなど
  const threeDaysLater = new Date();
  threeDaysLater.setDate(threeDaysLater.getDate() + 3);
  const next = threeDaysLater.toISOString().slice(0, 10);

  const ids = data.map((row) => row.employee_id);

  const { error: updateError } = await supabase
    .from('leave_balances')
    .update({
      next_remind_date: next,
      remind_status: 'sent',
    })
    .in('employee_id', ids);

  if (updateError) {
    console.error(updateError);
    // メールは送れているので 200 にしておくが、ログだけ残す
  }

  return c.json({ message: 'リマインドメールを送信しました', count: data.length });
});

//管理者用：全従業員の申請一覧
leaveRoutes.get('/admin/leaves', adminGuard, async (c) => {
  const employeeId = c.req.query('employeeId');
  const leaveType = c.req.query('leaveType');
  const statusParam = c.req.query('status'); 

  let query = supabase
    .from('leaves')
    .select(
      'id, employee_id, employee_name, leave_type, date, submitted_at, reason, status'
    )
    .order('submitted_at', { ascending: false });

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }
  if (leaveType && leaveType !== 'すべて' && leaveType !== '全て') {
    query = query.eq('leave_type', leaveType);
  }

  if (
    statusParam === 'pending' ||
    statusParam === 'approved' ||
    statusParam === 'rejected'
  ) {
    query = query.eq('status', statusParam);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[admin:list] error:', error);
    return c.json({ message: 'list failed' }, 500);
  }

  return c.json({ items: data ?? [] });
});

// 管理者用：ステータス更新
leaveRoutes.patch('/admin/leaves/:id/status', adminGuard, async (c) => {
  const id = c.req.param('id');

  // body: { status: 'approved' | 'rejected', rejectReason?: string }
  const body = await c.req.json().catch(() => null);
  console.log('[admin:status] id =', id, 'body =', body);

  const status = body?.status as 'approved' | 'rejected' | undefined;
  const rejectReason = (body?.rejectReason as string | undefined)?.trim();

  if (status !== 'approved' && status !== 'rejected') {
    return c.json({ message: 'invalid status' }, 400);
  }

  // 現在の申請内容を取得
  const { data: current, error: curErr } = await supabase
    .from('leaves')
    .select('id, status, employee_id, leave_type, reason')
    .eq('id', id)
    .single();

  if (curErr || !current) {
    console.error('[admin:status] fetch current error:', curErr);
    return c.json({ message: 'not found' }, 404);
  }

  // 同じステータスなら何もしない
  if (current.status === status) {
    return c.json({ ok: true, id: current.id, status: current.status });
  }

  // --- 有給残数の増減ロジック ---
  if (current.leave_type === '有給') {
    const { data: bal, error: balErr } = await supabase
      .from('leave_balances')
      .select('paid_given, paid_used')
      .eq('employee_id', current.employee_id)
      .single();

    if (balErr || !bal) {
      console.error('[admin:status] balance fetch error:', balErr);
      return c.json({ message: 'balance fetch failed' }, 500);
    }

    let newUsed = bal.paid_used;

    // pending → approved の時だけ 1 日消費
    if (current.status === 'pending' && status === 'approved') {
      const remain = bal.paid_given - bal.paid_used;
      if (remain <= 0) {
        return c.json({ message: '有給の残りがありません' }, 400);
      }
      newUsed = bal.paid_used + 1;
    }

    // approved → rejected の時は 1 日戻す
    if (current.status === 'approved' && status === 'rejected') {
      newUsed = Math.max(0, bal.paid_used - 1);
    }

    // 値が変わる時だけ UPDATE
    if (newUsed !== bal.paid_used) {
      const { error: updErr } = await supabase
        .from('leave_balances')
        .update({
          paid_used: newUsed,
          updated_at: new Date().toISOString(),
        })
        .eq('employee_id', current.employee_id);

      if (updErr) {
        console.error('[admin:status] balance update error:', updErr);
        return c.json({ message: 'balance update failed' }, 500);
      }
    }
  }

  // --- 却下理由の反映 ---
  let newReason = current.reason;
  if (status === 'rejected' && rejectReason) {
    newReason = rejectReason;
  }

  // ステータス自体を更新
  const { data, error } = await supabase
    .from('leaves')
    .update({ status, reason: newReason })
    .eq('id', id)
    .select('id, status, reason')
    .single();

  if (error) {
    console.error('[admin:status] update error:', error);
    return c.json({ message: 'update failed' }, 500);
  }

  //// action_log に insert（失敗しても申請の更新は成功扱い）
  const { error: logErr } = await supabase
    .from('leave_action_logs')
    .insert({
      leave_id: String(current.id),
      action: status,
      previous_status: current.status,
      new_status: data.status,
      reject_reason: status === 'rejected' ? newReason : null,
    });

    if (logErr) {
      console.error('[leave_action?logs] insert error:', logErr);
    }

    //デバック用ログ（ターミナルで追いやすく）
    console.log('[leave_action_logs]',{
      leaveId: current.id,
      action: status,
      previousStstus: current.status,
      newStatus: data.status,
      rejectReason: status === 'rejected' ? newReason : null,
    });


    return c.json({ ok: true, id: data.id, status: data.status });
});

// --------------- inventory ----------------
// server.ts（Hono）
leaveRoutes.get("/api/inventory/view", async (c) => {
  const store_id = String(c.req.query("store_id") ?? "").trim();

  // v0.1：まずは固定。許可店舗だけ通す
  const allowed = new Set(["7249", "7539", "7777"]);
  if (!allowed.has(store_id)) {
    return c.json({ ok: false, error: "invalid store_id" }, 400);
  }

  const now = new Date().toISOString();

  // モック（ここは後でDB計算結果に置換）
  return c.json({
    ok: true,
    store_id,
    updated_at: now,
    items: [
      { item_code: "CHEESE", name: "チーズ", unit: "袋", required_qty: 3 },
      { item_code: "DOUGH", name: "生地", unit: "玉", required_qty: 28 },
      { item_code: "PEPPERONI", name: "ペパロニ", unit: "袋", required_qty: 2 },
      { item_code: "BOX_M", name: "M箱", unit: "枚", required_qty: 40 },
    ],
  });
});



//404 ログ　(何に当たってないか出す)
leaveRoutes.all('*', (c) => {
  console.log ('[404]', c.req.method, c.req.path)
  return c.text ('not found', 404)
})


