const db = supabase.createClient(CFG.url, CFG.key);
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const $app = $('#app'), $top = $('#top'), $tabs = $('#tabs');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ST = {translate:'Переклад', clean:'Клін', edit:'Редакт', type:'Тайп', qc:'QC'};
const STAGES = Object.keys(ST);
const SS = {waiting:'чекає', todo:'можна брати', in_progress:'в роботі', done:'готово'};
const CS = {in_progress:'у роботі', curator_review:'перевірка куратора', ready_to_upload:'готово до заливу', published:'викладено'};
const HL = {late:'прострочено', at_risk:'під ризиком', ok:'ок', done:'викладено'};
let me, profiles = [], roles = [], uroles = [];

const has = k => uroles.some(u => u.user_id === me.id && u.role_key === k);
const isAdmin = () => has('head') || has('dev');
const q = async p => { const r = await p; if (r.error) { alert(r.error.message); return null; } return r.data ?? true; };
const roleFits = (rk, stage, kind) => roles.some(r => r.key === rk && r.stage === stage && (!r.track || r.track === (kind === 'manga' ? 'bw' : 'color')));
const fmtT = d => new Date(d).toLocaleString('uk-UA', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const parseNums = str => str.split(',').flatMap(p => {
  p = p.trim(); const m = p.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (m) { const a = +m[1], b = +m[2]; return b >= a && b - a < 100 ? Array.from({length: b - a + 1}, (_, i) => String(a + i)) : []; }
  return p ? [p] : [];
});
const ICON = {
  dash: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  titles: '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  tasks: '<path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  board: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  team: '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  people: '<circle cx="9" cy="8" r="4"/><path d="M1 21a8 8 0 0 1 16 0"/><path d="M17 4a4 4 0 0 1 0 8M23 21a8 8 0 0 0-5-7.4"/>'
};
const ic = k => `<svg class="ic" viewBox="0 0 24 24">${ICON[k]}</svg>`;
function buildNav() {
  const N = [['#/', 'Дашборд', 'dash'], ['#/titles', 'Тайтли', 'titles'], ['#/mine', 'Завдання', 'tasks'], ['#/board', 'Біржа', 'board']];
  const X = [['#/team', 'Команда', 'team']];
  if (isAdmin()) X.push(['#/people', 'Люди', 'people']);
  const a = (arr, cls = '') => arr.map(([h, l, i]) => `<a href="${h}" data-h="${h}" class="${cls}">${ic(i)}<span>${l}</span></a>`).join('');
  $top.innerHTML = `<a class="brand" href="#/"><i></i>Pedalos</a><nav class="nav">${a(N)}${a(X)}</nav>
    <details class="um"><summary>${me.avatar_url ? `<img src="${esc(me.avatar_url)}" alt="">` : esc(me.display_name.slice(0, 1).toUpperCase())}</summary><div class="menu">
    <div class="who">${esc(me.display_name)}</div>${a([['#/profile', 'Профіль', 'user']])}${a(X, 'mob')}<button id="out">Вийти</button></div></details>`;
  $tabs.innerHTML = a(N);
  $('#out').onclick = logout;
}
const days = d => d ? Math.ceil((new Date(d) - new Date().setHours(0,0,0,0)) / 864e5) : null;

/* ---------- вхід ---------- */
const errUA = m => /not confirmed/i.test(m) ? 'Спочатку підтверди email за листом'
  : /invalid login/i.test(m) ? 'Невірний email або пароль'
  : /already registered/i.test(m) ? 'Цей email уже зареєстровано. Спробуй увійти'
  : /password/i.test(m) ? 'Пароль має містити щонайменше 6 символів' : m;
function loginView(msg = '', mode = 'in', good = false) {
  const reg = mode === 'up';
  $top.innerHTML = ''; $tabs.innerHTML = '';
  $app.innerHTML = `<form class="card narrow" id="f"><h1>PedalosTeam</h1>
    <h2 class="mode">${reg ? 'Реєстрація' : 'Вхід'}</h2>
    <p class="note ${good ? 'good' : ''}" id="nt" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
    ${reg ? '<input id="n" placeholder="Імʼя (так тебе бачитиме команда)" autocomplete="nickname">' : ''}
    <input id="e" type="email" placeholder="Email" autocomplete="email">
    <input id="p" type="password" placeholder="Пароль (від 6 символів)" autocomplete="${reg ? 'new-password' : 'current-password'}">
    <button>${reg ? 'Створити акаунт' : 'Увійти'}</button>
    <p class="muted switch">${reg ? 'Вже є акаунт? <a href="#" id="sw">Увійти</a>' : 'Немає акаунта? <a href="#" id="sw">Зареєструватися</a>'}</p></form>`;
  const say = t => { const n = $('#nt'); n.classList.remove('good'); n.textContent = t; n.hidden = !t; };
  $('#sw').onclick = ev => { ev.preventDefault(); loginView('', reg ? 'in' : 'up'); };
  $('#f').onsubmit = async ev => {
    ev.preventDefault();
    const email = $('#e').value.trim(), password = $('#p').value;
    if (!email || !password) return say('Вкажи email і пароль');
    if (!reg) {
      const {error} = await db.auth.signInWithPassword({email, password});
      return error ? say(errUA(error.message)) : boot();
    }
    const name = $('#n').value.trim();
    if (!name) return say('Вкажи імʼя');
    const {data, error} = await db.auth.signUp({email, password, options: {data: {display_name: name}}});
    if (error) return say(errUA(error.message));
    data.session ? boot() : loginView('Акаунт створено. Підтверди email за листом і увійди.', 'in', true);
  };
}
const logout = async () => { await db.auth.signOut(); me = null; location.hash = ''; loginView(); };

async function loadRefs() {
  const [a, b, c] = await Promise.all([
    db.from('profiles').select('*').order('display_name'),
    db.from('roles').select('*'),
    db.from('user_roles').select('*')]);
  profiles = a.data || []; roles = b.data || []; uroles = c.data || [];
}

async function boot() {
  const {data: {session}} = await db.auth.getSession();
  if (!session) return loginView();
  me = (await db.from('profiles').select('*').eq('id', session.user.id).single()).data;
  if (!me || !me.is_active) {
    $top.innerHTML = ''; $tabs.innerHTML = '';
    $app.innerHTML = `<div class="card narrow"><h2>Акаунт чекає підтвердження</h2>
      <p class="muted">Керівництво має активувати твій профіль, тоді оновіть сторінку.</p>
      <button id="out" class="ghost">Вийти</button></div>`;
    $('#out').onclick = logout;
    return;
  }
  await loadRefs();
  buildNav();
  route();
}

/* ---------- роутер ---------- */
const views = {'': dashV, titles: titlesV, title: titleV, chapter: chapterV, mine: mineV, team: teamV, board: boardV, profile: profileV, people: peopleV};
async function route() {
  if (!me) return;
  const [, page = '', id] = location.hash.split('/');
  $$('[data-h]').forEach(a => a.classList.toggle('on', a.dataset.h === '#/' + page));
  $('.um')?.removeAttribute('open');
  $app.innerHTML = '<p class="muted">Завантаження…</p>';
  await (views[page] || dashV)(id);
}
window.onhashchange = route;

/* ---------- дашборд ---------- */
async function dashV() {
  const [o, s] = await Promise.all([
    db.from('v_chapter_overview').select('*').neq('status', 'published'),
    db.from('chapter_stages').select('chapter_id,stage,status,assignee_id')]);
  const st = {}, who = {};
  (s.data || []).forEach(x => {
    (st[x.chapter_id] ??= {})[x.stage] = x.status;
    if (x.assignee_id) (who[x.chapter_id] ??= new Set()).add(x.assignee_id);
  });
  const all = o.data || [];
  const pr = {late: 0, at_risk: 1, ok: 2, done: 3};
  const n = f => all.filter(f).length;
  $app.innerHTML = `<h2>Дашборд</h2><div class="stats">
    <div class="card"><b class="bad">${n(r => r.health === 'late')}</b>прострочено</div>
    <div class="card"><b class="warn">${n(r => r.health === 'at_risk')}</b>під ризиком</div>
    <div class="card"><b>${n(r => r.status === 'curator_review')}</b>чекають куратора</div>
    <div class="card"><b class="good">${n(r => r.status === 'ready_to_upload')}</b>готові до заливу</div></div>
    <div class="row filters"><input id="fs" type="search" placeholder="Пошук: тайтл або розділ">
      <select id="ft"><option value="">Усі тайтли</option>${[...new Set(all.map(r => r.title_name))].sort().map(x => `<option>${esc(x)}</option>`).join('')}</select>
      <select id="fh"><option value="">Усі статуси</option><option value="late">прострочено</option><option value="at_risk">під ризиком</option><option value="curator_review">чекають куратора</option><option value="ready_to_upload">готові до заливу</option></select>
      <select id="fw"><option value="">Усі виконавці</option>${profiles.filter(p => p.is_active).map(p => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}</select></div>
    <div class="card" id="dt"></div>`;
  const draw = () => {
    const f = {s: $('#fs').value.trim().toLowerCase(), t: $('#ft').value, h: $('#fh').value, w: $('#fw').value};
    const rows = all.filter(r => (!f.s || `${r.title_name} ${r.number}`.toLowerCase().includes(f.s)) && (!f.t || r.title_name === f.t)
      && (!f.h || r.health === f.h || r.status === f.h) && (!f.w || who[r.chapter_id]?.has(f.w)))
      .sort((a, b) => pr[a.health] - pr[b.health] || String(a.deadline).localeCompare(String(b.deadline)));
    $('#dt').innerHTML = `<table class="dash"><tr><th>Тайтл</th><th>Розділ</th><th>Етапи</th><th>Дедлайн</th><th>Статус</th></tr>
    ${rows.map(r => {
      const d = days(r.deadline);
      return `<tr class="link" onclick="location.hash='#/chapter/${r.chapter_id}'"><td>${esc(r.title_name)}</td><td>${esc(r.number)}</td>
      <td>${STAGES.map(k => `<i class="dot ${st[r.chapter_id]?.[k] || ''}" title="${ST[k]}: ${SS[st[r.chapter_id]?.[k]] || '—'}"></i>`).join('')}</td>
      <td>${r.deadline || '—'}${d !== null ? ` <span class="muted">(${d} дн.)</span>` : ''}</td>
      <td><span class="badge ${r.health}">${HL[r.health]}</span> <span class="muted">${CS[r.status]}</span></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Нічого не знайдено</td></tr>'}</table>`;
  };
  ['#fs', '#ft', '#fh', '#fw'].forEach(i => $(i).oninput = draw);
  draw();
}

/* ---------- тайтли ---------- */
async function titlesV() {
  const [t, c] = await Promise.all([db.from('titles').select('*').order('name'), db.from('chapters').select('title_id,status')]);
  const open = {};
  (c.data || []).filter(x => x.status !== 'published').forEach(x => open[x.title_id] = (open[x.title_id] || 0) + 1);
  $app.innerHTML = `<h2>Тайтли</h2>
    ${isAdmin() ? `<div class="row"><input id="tn" placeholder="Назва тайтла"><select id="tk"><option value="manga">Манга (ЧБ)</option><option value="manhwa">Манхва (колір)</option></select><button id="ta">Додати</button></div>` : ''}
    ${(t.data || []).map(x => `<a class="card" style="display:block;margin-bottom:8px;text-decoration:none;color:inherit" href="#/title/${x.id}">
      <b>${esc(x.name)}</b> <span class="muted">· ${x.kind === 'manga' ? 'манга' : 'манхва'} · відкритих розділів: ${open[x.id] || 0}</span></a>`).join('') || '<p class="muted">Тайтлів ще немає</p>'}`;
  if (isAdmin()) $('#ta').onclick = async () => {
    const name = $('#tn').value.trim();
    if (name && await q(db.from('titles').insert({name, kind: $('#tk').value}))) route();
  };
}

async function titleV(id) {
  const [t, c, m] = await Promise.all([
    db.from('titles').select('*').eq('id', id).single(),
    db.from('v_chapter_overview').select('*').eq('title_id', id).order('chapter_id', {ascending: false}),
    db.from('title_members').select('*').eq('title_id', id).eq('role_key', 'title_curator')]);
  if (!t.data) return $app.innerHTML = '<p>Тайтл не знайдено</p>';
  const mem = m.data || [];
  const manage = isAdmin() || mem.some(x => x.user_id === me.id);
  const nm = uid => esc(profiles.find(p => p.id === uid)?.display_name || '?');
  $app.innerHTML = `<h2>${esc(t.data.name)}</h2>
    <p class="muted">Куратори: ${mem.map(x => `<span class="chip" data-del="${x.user_id}">${nm(x.user_id)}${isAdmin() ? ' ✕' : ''}</span>`).join('') || '—'}</p>
    ${isAdmin() ? `<div class="row"><select id="cu">${profiles.filter(p => p.is_active).map(p => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}</select><button id="ca" class="ghost">Додати куратора</button></div>` : ''}
    ${manage ? `<div class="row"><input id="cn" placeholder="Розділи: 15 або 15-20 або 15,17,20-22" style="flex:2;min-width:200px"><input id="cd" type="date" title="Дедлайн (першого)"><input id="cs" type="number" min="0" value="0" title="Дні між дедлайнами" style="width:90px" placeholder="крок"><button id="cb">Додати</button></div>` : ''}
    <div class="card"><table class="chs"><tr><th>Розділ</th><th>Дедлайн</th><th>Статус</th></tr>
    ${(c.data || []).map(r => `<tr class="link" onclick="location.hash='#/chapter/${r.chapter_id}'"><td>${esc(r.number)}</td><td>${r.deadline || '—'}</td>
      <td><span class="badge ${r.health}">${HL[r.health]}</span> <span class="muted">${CS[r.status]}</span></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Розділів ще немає</td></tr>'}</table></div>`;
  if (manage) $('#cb').onclick = async () => {
    const nums = parseNums($('#cn').value), d0 = $('#cd').value, step = +$('#cs').value || 0;
    if (!nums.length) return alert('Вкажи номери розділів');
    const rows = nums.map((number, i) => ({title_id: id, number, deadline: d0 ? addDays(d0, i * step) : null}));
    if (await q(db.from('chapters').insert(rows))) route();
  };
  if (isAdmin()) {
    $('#ca').onclick = async () => { if (await q(db.from('title_members').insert({title_id: id, user_id: $('#cu').value, role_key: 'title_curator'}))) route(); };
    $$('[data-del]').forEach(ch => ch.onclick = async () => {
      if (await q(db.from('title_members').delete().match({title_id: id, user_id: ch.dataset.del, role_key: 'title_curator'}))) route();
    });
  }
}

/* ---------- розділ ---------- */
async function chapterV(id) {
  const {data: c} = await db.from('chapters').select('*,titles(id,name,kind)').eq('id', id).single();
  if (!c) return $app.innerHTML = '<p>Розділ не знайдено</p>';
  const [s, m, cm, ev] = await Promise.all([
    db.from('chapter_stages').select('*').eq('chapter_id', id),
    db.from('title_members').select('*').eq('title_id', c.title_id).eq('role_key', 'title_curator'),
    db.from('chapter_comments').select('*').eq('chapter_id', id).order('created_at'),
    db.from('chapter_events').select('*').eq('chapter_id', id).order('created_at', {ascending: false}).limit(40)]);
  const kind = c.titles.kind, qc = has('qc');
  const manage = isAdmin() || (m.data || []).some(x => x.user_id === me.id);
  const myR = uroles.filter(u => u.user_id === me.id);
  const nm = uid => esc(profiles.find(p => p.id === uid)?.display_name || '—');
  const fits = (uid, k) => uroles.some(u => u.user_id === uid && roleFits(u.role_key, k, kind));
  const canClaim = k => myR.some(u => !u.is_trainee && roleFits(u.role_key, k, kind));
  const body = STAGES.map(k => {
    const x = (s.data || []).find(z => z.stage === k) || {};
    const cand = profiles.filter(p => p.is_active && (fits(p.id, k) || p.id === x.assignee_id));
    const own = x.assignee_id === me.id, edit = manage || own || (k === 'qc' && qc);
    const btns = [
      edit && x.status === 'todo' ? `<button data-s="${k}" data-v="in_progress">Почати</button>` : '',
      edit && x.status === 'in_progress' ? `<button data-s="${k}" data-v="done">Готово</button>` : '',
      !x.assignee_id && ['waiting', 'todo'].includes(x.status) && canClaim(k) ? `<button class="ghost" data-claim="${k}">Взяти</button>` : '',
      own && ['waiting', 'todo', 'in_progress'].includes(x.status) ? `<button class="ghost" data-rel="${k}">Відмовитись</button>` : '',
      (manage || qc) && ['in_progress', 'done'].includes(x.status) ? `<button class="ghost" data-ret="${k}">Повернути</button>` : ''].join('');
    return `<div class="card stg"><div class="stage"><b>${ST[k]}</b><span class="badge ${x.status}">${SS[x.status] || '—'}</span>
      <select data-a="${k}" ${manage ? '' : 'disabled'}><option value="">— виконавець —</option>${cand.map(p => `<option value="${p.id}" ${p.id === x.assignee_id ? 'selected' : ''}>${esc(p.display_name)}</option>`).join('')}</select></div>
      <div class="stage"><input class="file" type="url" placeholder="Посилання на файли (Drive)" value="${esc(x.file_url || '')}" data-fu="${k}" ${edit ? '' : 'disabled'}>
      ${x.file_url ? `<a href="${esc(x.file_url)}" target="_blank" rel="noopener">Відкрити ↗</a>` : ''}</div>
      ${btns ? `<div class="stage">${btns}</div>` : ''}</div>`;
  }).join('');
  const cms = (cm.data || []).map(z => `<div class="cm"><div class="muted">${nm(z.author_id)} · ${fmtT(z.created_at)}${z.stage ? ` · <span class="chip">${ST[z.stage]}</span>` : ''}${z.author_id === me.id || isAdmin() ? ` · <a href="#" data-dc="${z.id}">видалити</a>` : ''}</div><div>${esc(z.body)}</div></div>`).join('') || '<p class="muted">Коментарів ще немає</p>';
  const evT = e => {
    const d = e.details || {};
    if (e.action === 'approved') return 'підтвердив(ла) розділ';
    if (e.action === 'published') return 'позначив(ла) викладеним';
    if (d.status_from !== d.status_to) return `${ST[e.stage] || ''}: ${SS[d.status_from] || ''} → ${SS[d.status_to] || ''}`;
    return `${ST[e.stage] || ''}: виконавець — ${d.assignee ? nm(d.assignee) : 'нікого'}`;
  };
  const act = c.status === 'curator_review' && manage ? '<button id="ap">Підтвердити розділ</button>'
    : c.status === 'ready_to_upload' && (has('uploader') || isAdmin()) ? '<button id="pb">Позначити викладеним</button>' : '';
  $app.innerHTML = `<p><a href="#/title/${c.title_id}">← ${esc(c.titles.name)}</a></p><h2>Розділ ${esc(c.number)}</h2>
    <div class="row"><span class="badge">${CS[c.status]}</span> Дедлайн: <input type="date" id="dl" value="${c.deadline || ''}" ${manage ? '' : 'disabled'}> ${act}</div>${body}
    <h3>Коментарі</h3>${cms}
    <div class="row"><select id="cs"><option value="">загальний</option>${STAGES.map(k => `<option value="${k}">${ST[k]}</option>`).join('')}</select>
      <input id="ct" placeholder="Написати коментар…" style="flex:1;min-width:160px"><button id="cb">Надіслати</button></div>
    <details class="card" style="margin-top:14px"><summary>Журнал змін (${(ev.data || []).length})</summary>
    ${(ev.data || []).map(e => `<div class="muted">${fmtT(e.created_at)} · ${nm(e.actor_id)} — ${evT(e)}</div>`).join('')}</details>`;
  const rpc = async (fn, args) => { if (await q(db.rpc(fn, args))) route(); };
  $$('[data-s]').forEach(b => b.onclick = async () => {
    if (await q(db.from('chapter_stages').update({status: b.dataset.v}).eq('chapter_id', id).eq('stage', b.dataset.s))) route();
  });
  $$('[data-a]').forEach(se => se.onchange = async () => {
    await q(db.from('chapter_stages').update({assignee_id: se.value || null}).eq('chapter_id', id).eq('stage', se.dataset.a));
    route();
  });
  $$('[data-fu]').forEach(i => i.onchange = async () => {
    await q(db.from('chapter_stages').update({file_url: i.value.trim() || null}).eq('chapter_id', id).eq('stage', i.dataset.fu));
    route();
  });
  $$('[data-claim]').forEach(b => b.onclick = () => rpc('claim_stage', {c: Number(id), s: b.dataset.claim}));
  $$('[data-rel]').forEach(b => b.onclick = () => rpc('release_stage', {c: Number(id), s: b.dataset.rel}));
  $$('[data-ret]').forEach(b => b.onclick = () => {
    const note = prompt('Що виправити? (коментар для виконавця)');
    if (note !== null) rpc('return_stage', {c: Number(id), s: b.dataset.ret, note});
  });
  $('#cb').onclick = async () => {
    const t = $('#ct').value.trim();
    if (t && await q(db.from('chapter_comments').insert({chapter_id: id, stage: $('#cs').value || null, body: t}))) route();
  };
  $$('[data-dc]').forEach(a => a.onclick = async e => {
    e.preventDefault();
    if (await q(db.from('chapter_comments').delete().eq('id', a.dataset.dc))) route();
  });
  $('#dl').onchange = async e => { await q(db.from('chapters').update({deadline: e.target.value || null}).eq('id', id)); route(); };
  if ($('#ap')) $('#ap').onclick = () => rpc('approve_chapter', {c: Number(id)});
  if ($('#pb')) $('#pb').onclick = () => rpc('mark_published', {c: Number(id), url: prompt('Посилання на викладений розділ (можна пропустити):') || null});
}

/* ---------- мої завдання ---------- */
async function mineV() {
  const [mt, fr] = await Promise.all([
    db.from('chapter_stages').select('*,chapters(id,number,deadline,titles(name))').eq('assignee_id', me.id).in('status', ['todo', 'in_progress']),
    db.from('chapter_stages').select('*,chapters(id,number,deadline,titles(name,kind))').is('assignee_id', null).eq('status', 'todo')]);
  const mineR = uroles.filter(u => u.user_id === me.id && !u.is_trainee);
  const free = (fr.data || []).filter(x => mineR.some(u => roleFits(u.role_key, x.stage, x.chapters.titles.kind)));
  const card = (x, btn) => `<div class="card stage"><a href="#/chapter/${x.chapters.id}"><b style="width:auto">${esc(x.chapters.titles.name)} · розділ ${esc(x.chapters.number)}</b></a>
    <span>${ST[x.stage]}</span><span class="badge ${x.status}">${SS[x.status]}</span><span class="muted">дедлайн: ${x.chapters.deadline || '—'}</span>${btn}</div>`;
  $app.innerHTML = `<h2>Мої завдання</h2>
    ${(mt.data || []).map(x => card(x, `<button data-c="${x.chapter_id}" data-s="${x.stage}" data-v="${x.status === 'todo' ? 'in_progress' : 'done'}">${x.status === 'todo' ? 'Почати' : 'Готово'}</button>`)).join('') || '<p class="muted">Поки що завдань немає</p>'}
    <h3>Вільні завдання для тебе</h3>
    ${free.map(x => card(x, `<button class="ghost" data-claim="${x.chapter_id}|${x.stage}">Взяти</button>`)).join('') || '<p class="muted">Вільних завдань немає</p>'}`;
  $$('[data-c]').forEach(b => b.onclick = async () => {
    if (await q(db.from('chapter_stages').update({status: b.dataset.v}).eq('chapter_id', b.dataset.c).eq('stage', b.dataset.s))) route();
  });
  $$('[data-claim]').forEach(b => b.onclick = async () => {
    const [c, st] = b.dataset.claim.split('|');
    if (await q(db.rpc('claim_stage', {c: Number(c), s: st}))) route();
  });
}

/* ---------- команда і навантаження ---------- */
async function teamV() {
  const {data} = await db.from('chapter_stages').select('assignee_id,status,done_at,chapters(deadline)').not('assignee_id', 'is', null);
  const today = new Date().toISOString().slice(0, 10), ago = Date.now() - 30 * 864e5, A = {};
  (data || []).forEach(x => {
    const a = A[x.assignee_id] ??= {act: 0, prog: 0, late: 0, done: 0};
    if (x.status === 'done') { if (x.done_at && new Date(x.done_at) > ago) a.done++; return; }
    if (x.status === 'todo' || x.status === 'in_progress') {
      a.act++;
      if (x.status === 'in_progress') a.prog++;
      if (x.chapters?.deadline && x.chapters.deadline < today) a.late++;
    }
  });
  const rl = id => uroles.filter(u => u.user_id === id).map(u => (roles.find(r => r.key === u.role_key)?.label || u.role_key) + (u.rank ? ' ' + u.rank : '')).join(', ');
  const rows = profiles.filter(p => p.is_active).map(p => ({p, ...(A[p.id] || {act: 0, prog: 0, late: 0, done: 0})}))
    .sort((a, b) => b.act - a.act || b.done - a.done);
  $app.innerHTML = `<h2>Команда і навантаження</h2><div class="card"><table class="team">
    <tr><th>Людина</th><th>Ролі</th><th>Активні</th><th>В роботі</th><th>Прострочені</th><th>Зроблено за 30 днів</th></tr>
    ${rows.map(r => `<tr><td>${esc(r.p.display_name)}</td><td class="muted">${esc(rl(r.p.id))}</td>
      <td data-l="Активні">${r.act}</td><td data-l="В роботі">${r.prog}</td>
      <td data-l="Прострочені" class="${r.late ? 'bad' : ''}">${r.late}</td><td data-l="За 30 днів">${r.done}</td></tr>`).join('')}</table></div>`;
}

/* ---------- люди (тільки керівництво) ---------- */
async function peopleV() {
  await loadRefs();
  const lab = k => roles.find(r => r.key === k)?.label || k;
  $app.innerHTML = `<h2>Люди</h2>${profiles.map(p => `<div class="card" style="margin-bottom:8px">
    <label><input type="checkbox" data-act="${p.id}" ${p.is_active ? 'checked' : ''}> <b>${esc(p.display_name)}</b></label>
    <div>${uroles.filter(u => u.user_id === p.id).map(u => `<span class="chip" data-ur="${p.id}|${u.role_key}">${esc(lab(u.role_key))}${u.rank ? ' · ' + u.rank : ''}${u.is_trainee ? ' · учень' : ''}${u.is_direction_curator ? ' · куратор' : ''} ✕</span>`).join('')}</div>
    <div class="row" style="margin:6px 0 0"><select data-r="${p.id}">${roles.map(r => `<option value="${r.key}">${esc(r.label)}</option>`).join('')}</select>
    <select data-k="${p.id}"><option value="">без рангу</option><option>C</option><option>B</option><option>A</option><option>S</option></select>
    <label><input type="checkbox" data-t="${p.id}"> учень</label><label><input type="checkbox" data-c="${p.id}"> куратор напряму</label>
    <select data-m="${p.id}"><option value="">наставник</option>${profiles.filter(x => x.is_active && x.id !== p.id).map(x => `<option value="${x.id}">${esc(x.display_name)}</option>`).join('')}</select>
    <button class="ghost" data-add="${p.id}">+ роль</button></div></div>`).join('')}`;
  $$('[data-act]').forEach(c => c.onchange = async () => { await q(db.from('profiles').update({is_active: c.checked}).eq('id', c.dataset.act)); });
  $$('[data-ur]').forEach(c => c.onclick = async () => {
    const [user_id, role_key] = c.dataset.ur.split('|');
    if (await q(db.from('user_roles').delete().match({user_id, role_key}))) peopleV();
  });
  $$('[data-add]').forEach(b => b.onclick = async () => {
    const u = b.dataset.add;
    const row = {user_id: u, role_key: $(`[data-r="${u}"]`).value, rank: $(`[data-k="${u}"]`).value || null,
      is_trainee: $(`[data-t="${u}"]`).checked, is_direction_curator: $(`[data-c="${u}"]`).checked,
      mentor_id: $(`[data-m="${u}"]`).value || null};
    if (await q(db.from('user_roles').insert(row))) peopleV();
  });
}

/* ---------- біржа ---------- */
const rv = r => ({C: 1, B: 2, A: 3, S: 4}[r] || 0);
async function boardV() {
  const [p, a, t, mt] = await Promise.all([
    db.from('job_postings').select('*,titles(name)').neq('status', 'closed').order('created_at', {ascending: false}),
    db.from('job_applications').select('*'),
    db.from('titles').select('id,name').order('name'),
    db.from('title_members').select('title_id').eq('user_id', me.id).eq('role_key', 'title_curator')]);
  const mine = (mt.data || []).map(x => x.title_id);
  const myTitles = isAdmin() ? (t.data || []) : (t.data || []).filter(x => mine.includes(x.id));
  const work = roles.filter(r => r.kind === 'work');
  const lab = k => roles.find(r => r.key === k)?.label || k;
  const nm = uid => esc(profiles.find(x => x.id === uid)?.display_name || '?');
  const AS = {pending: 'на розгляді', accepted: 'прийнято', rejected: 'відхилено'};
  $app.innerHTML = `<h2>Біржа</h2>
    ${myTitles.length ? `<div class="row"><select id="bt">${myTitles.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>
      <select id="br">${work.map(r => `<option value="${r.key}">${esc(r.label)}</option>`).join('')}</select>
      <select id="bk"><option value="">будь-який ранг</option><option>C</option><option>B</option><option>A</option><option>S</option></select>
      <input id="bn" placeholder="Опис / умови" style="flex:1;min-width:160px"><button id="bb">Опублікувати</button></div>` : ''}
    ${(p.data || []).map(x => {
      const ap = (a.data || []).filter(z => z.posting_id === x.id);
      const my = ap.find(z => z.applicant_id === me.id);
      const ur = uroles.find(u => u.user_id === me.id && u.role_key === x.role_key);
      const manage = isAdmin() || mine.includes(x.title_id);
      const canApply = x.status === 'open' && !manage && ur && !my && (!x.min_rank || rv(ur.rank) >= rv(x.min_rank));
      return `<div class="card" style="margin-bottom:10px"><b>${esc(x.titles.name)}</b> · ${esc(lab(x.role_key))}
        ${x.min_rank ? `<span class="badge">від ${x.min_rank}</span>` : ''} ${x.status === 'filled' ? '<span class="badge done">закрито</span>' : ''}
        <p class="muted">${esc(x.note || '')}</p>
        ${canApply ? `<button data-ap="${x.id}">Відгукнутись</button>` : ''}
        ${my ? `<span class="badge ${my.status === 'accepted' ? 'done' : ''}">твоя заявка: ${AS[my.status]}</span>` : ''}
        ${manage ? `${ap.map(z => `<div class="row"><span>${nm(z.applicant_id)}${z.message ? ` — <span class="muted">${esc(z.message)}</span>` : ''}</span>
          ${z.status === 'pending' && x.status === 'open' ? `<button data-ac="${z.id}">Прийняти</button><button class="ghost" data-rj="${z.id}">Відхилити</button>` : `<span class="badge">${AS[z.status]}</span>`}</div>`).join('')}
          <button class="ghost" data-cl="${x.id}">Закрити вакансію</button>` : ''}</div>`;
    }).join('') || '<p class="muted">Відкритих вакансій немає</p>'}`;
  if (myTitles.length) $('#bb').onclick = async () => {
    const row = {title_id: $('#bt').value, role_key: $('#br').value, min_rank: $('#bk').value || null, note: $('#bn').value.trim() || null};
    if (await q(db.from('job_postings').insert(row))) route();
  };
  $$('[data-ap]').forEach(b => b.onclick = async () => {
    const message = prompt('Коротко про себе (необовʼязково):') || null;
    if (await q(db.from('job_applications').insert({posting_id: b.dataset.ap, message}))) route();
  });
  $$('[data-ac]').forEach(b => b.onclick = async () => { if (await q(db.rpc('accept_application', {a: Number(b.dataset.ac)}))) route(); });
  $$('[data-rj]').forEach(b => b.onclick = async () => { if (await q(db.from('job_applications').update({status: 'rejected'}).eq('id', b.dataset.rj))) route(); });
  $$('[data-cl]').forEach(b => b.onclick = async () => { if (await q(db.from('job_postings').update({status: 'closed'}).eq('id', b.dataset.cl))) route(); });
}

/* ---------- профіль і підвищення ---------- */
async function profileV() {
  await loadRefs();
  const lab = k => roles.find(r => r.key === k)?.label || k;
  const nm = uid => esc(profiles.find(x => x.id === uid)?.display_name || '?');
  const isWork = k => roles.find(r => r.key === k)?.kind === 'work';
  const my = uroles.filter(u => u.user_id === me.id && isWork(u.role_key));
  const manageRoles = isAdmin() ? roles.filter(r => r.kind === 'work').map(r => r.key)
    : uroles.filter(u => u.user_id === me.id && u.is_direction_curator).map(u => u.role_key);
  const [rq, ru, ...chk] = await Promise.all([
    db.from('promotion_requests').select('*').eq('status', 'pending'),
    db.from('promotion_rules').select('*'),
    ...my.map(u => db.rpc('check_promotion', {u: me.id, r: u.role_key}))]);
  const reqs = rq.data || [], rules = ru.data || [];

  const mineHtml = my.map((u, i) => {
    const c = (chk[i].data || [])[0], err = chk[i].error?.message || '';
    const pend = reqs.find(x => x.user_id === me.id && x.role_key === u.role_key);
    let box;
    if (pend) box = `<span class="badge todo">запит на ${pend.to_rank} на розгляді</span> <button class="ghost" data-cp="${pend.id}">Скасувати</button>`;
    else if (err && !/max rank/.test(err)) box = `<span class="muted">${esc(err)}</span>`;
    else if (!c) box = '<span class="muted">Максимальний ранг</span>';
    else box = `<div class="muted">До рангу ${c.next_rank}: розділів ${c.chapters_done}/${c.chapters_needed}, днів у команді ${c.days_in_team}/${c.days_needed}${c.requirements ? '<br>' + esc(c.requirements) : ''}</div>
      ${c.eligible ? `<button data-rp="${u.role_key}">Подати запит на ${c.next_rank}</button>` : '<span class="badge">вимоги ще не виконані</span>'}`;
    return `<div class="card" style="margin-bottom:8px"><b>${esc(lab(u.role_key))}</b> · ${u.rank || 'без рангу'}${u.is_trainee ? ' · учень' : ''}${u.is_direction_curator ? ' · куратор напряму' : ''}${u.mentor_id ? ' · наставник: ' + nm(u.mentor_id) : ''}
      <div style="margin-top:8px">${box}</div></div>`;
  }).join('') || '<p class="muted">Ролей ще немає. Їх видає керівництво.</p>';

  const curHtml = manageRoles.map(k => {
    const pend = reqs.filter(x => x.role_key === k && x.user_id !== me.id);
    return `<details class="card" style="margin-bottom:8px"><summary><b>${esc(lab(k))}</b>${pend.length ? ` <span class="badge todo">запитів: ${pend.length}</span>` : ''}</summary>
      ${pend.map(x => `<div class="row" style="margin-top:8px"><span>${nm(x.user_id)}: ${x.from_rank || 'учень'} → ${x.to_rank}
        <span class="muted">(розділів ${x.stats?.chapters ?? '?'}, днів ${x.stats?.days_in_team ?? '?'})</span>${x.message ? ' — ' + esc(x.message) : ''}</span>
        <button data-dy="${x.id}">Схвалити</button><button class="ghost" data-dn="${x.id}">Відхилити</button></div>`).join('')}
      <p class="muted">Правила підвищення (розділів / днів / додаткові вимоги):</p>
      ${['C', 'B', 'A', 'S'].map(r => {
        const z = rules.find(y => y.role_key === k && y.to_rank === r) || {};
        return `<div class="row"><b style="width:24px">${r}</b>
          <input type="number" min="0" value="${z.min_chapters ?? 0}" data-f="${k}|${r}|c" style="width:80px">
          <input type="number" min="0" value="${z.min_days ?? 0}" data-f="${k}|${r}|d" style="width:80px">
          <input placeholder="Додаткові вимоги" value="${esc(z.requirements || '')}" data-f="${k}|${r}|t" style="flex:1;min-width:140px">
          <button class="ghost" data-sr="${k}|${r}">Зберегти</button></div>`;
      }).join('')}</details>`;
  }).join('');

  $app.innerHTML = `<h2>Профіль</h2><p class="muted">${esc(me.display_name)}</p>
    <h3>Мої ролі</h3>${mineHtml}${curHtml ? `<h3>Куратору напряму</h3>${curHtml}` : ''}`;

  $$('[data-rp]').forEach(b => b.onclick = async () => {
    const msg = prompt('Коментар до запиту (необовʼязково):') || null;
    if (await q(db.rpc('request_promotion', {r: b.dataset.rp, msg}))) profileV();
  });
  $$('[data-cp]').forEach(b => b.onclick = async () => { if (await q(db.rpc('cancel_promotion', {req: Number(b.dataset.cp)}))) profileV(); });
  $$('[data-dy]').forEach(b => b.onclick = async () => { if (await q(db.rpc('decide_promotion', {req: Number(b.dataset.dy), approve: true}))) profileV(); });
  $$('[data-dn]').forEach(b => b.onclick = async () => { if (await q(db.rpc('decide_promotion', {req: Number(b.dataset.dn), approve: false}))) profileV(); });
  $$('[data-sr]').forEach(b => b.onclick = async () => {
    const [k, r] = b.dataset.sr.split('|');
    const f = s => $(`[data-f="${k}|${r}|${s}"]`).value;
    const row = {role_key: k, to_rank: r, min_chapters: +f('c') || 0, min_days: +f('d') || 0, requirements: f('t').trim() || null, updated_at: new Date().toISOString()};
    if (await q(db.from('promotion_rules').upsert(row))) b.textContent = 'Збережено ✓';
  });
}

boot();
