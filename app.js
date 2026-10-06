const db = supabase.createClient(CFG.url, CFG.key);
const $ = s => document.querySelector(s), $$ = s => document.querySelectorAll(s);
const $app = $('#app'), $top = $('#top');
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
const days = d => d ? Math.ceil((new Date(d) - new Date().setHours(0,0,0,0)) / 864e5) : null;

/* ---------- вхід ---------- */
function loginView(msg = '') {
  $top.innerHTML = '';
  $app.innerHTML = `<form class="card narrow" id="f"><h1>PedalosTeam</h1>
    ${msg ? `<p class="muted">${esc(msg)}</p>` : ''}
    <input id="n" placeholder="Імʼя (тільки для реєстрації)">
    <input id="e" type="email" placeholder="Email">
    <input id="p" type="password" placeholder="Пароль (від 6 символів)">
    <div class="row"><button>Увійти</button><button type="button" id="reg" class="ghost">Реєстрація</button></div></form>`;
  const v = () => ({email: $('#e').value.trim(), password: $('#p').value});
  $('#f').onsubmit = async ev => {
    ev.preventDefault();
    const {error} = await db.auth.signInWithPassword(v());
    error ? loginView(error.message) : boot();
  };
  $('#reg').onclick = async () => {
    const name = $('#n').value.trim();
    if (!name) return loginView('Вкажи імʼя для реєстрації');
    const {data, error} = await db.auth.signUp({...v(), options: {data: {display_name: name}}});
    if (error) return loginView(error.message);
    data.session ? boot() : loginView('Перевір пошту для підтвердження, потім увійди.');
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
    $top.innerHTML = '';
    $app.innerHTML = `<div class="card narrow"><h2>Акаунт чекає підтвердження</h2>
      <p class="muted">Керівництво має активувати твій профіль, тоді оновіть сторінку.</p>
      <button id="out" class="ghost">Вийти</button></div>`;
    $('#out').onclick = logout;
    return;
  }
  await loadRefs();
  const t = [['#/', 'Дашборд'], ['#/titles', 'Тайтли'], ['#/mine', 'Мої завдання']];
  if (isAdmin()) t.push(['#/people', 'Люди']);
  $top.innerHTML = `<b>PedalosTeam</b>${t.map(([h, l]) => `<a href="${h}" data-h="${h}">${l}</a>`).join('')}
    <span class="grow"></span><span class="muted">${esc(me.display_name)}</span><button class="ghost" id="out">Вийти</button>`;
  $('#out').onclick = logout;
  route();
}

/* ---------- роутер ---------- */
const views = {'': dashV, titles: titlesV, title: titleV, chapter: chapterV, mine: mineV, people: peopleV};
async function route() {
  if (!me) return;
  const [, page = '', id] = location.hash.split('/');
  $$('#top a').forEach(a => a.classList.toggle('on', a.dataset.h === '#/' + page));
  $app.innerHTML = '<p class="muted">Завантаження…</p>';
  await (views[page] || dashV)(id);
}
window.onhashchange = route;

/* ---------- дашборд ---------- */
async function dashV() {
  const [o, s] = await Promise.all([
    db.from('v_chapter_overview').select('*').neq('status', 'published'),
    db.from('chapter_stages').select('chapter_id,stage,status')]);
  const st = {};
  (s.data || []).forEach(x => (st[x.chapter_id] ??= {})[x.stage] = x.status);
  const pr = {late: 0, at_risk: 1, ok: 2, done: 3};
  const rows = (o.data || []).sort((a, b) => pr[a.health] - pr[b.health] || String(a.deadline).localeCompare(String(b.deadline)));
  const n = f => rows.filter(f).length;
  $app.innerHTML = `<h2>Дашборд</h2><div class="stats">
    <div class="card"><b class="bad">${n(r => r.health === 'late')}</b>прострочено</div>
    <div class="card"><b class="warn">${n(r => r.health === 'at_risk')}</b>під ризиком</div>
    <div class="card"><b>${n(r => r.status === 'curator_review')}</b>чекають куратора</div>
    <div class="card"><b class="good">${n(r => r.status === 'ready_to_upload')}</b>готові до заливу</div></div>
    <div class="card"><table><tr><th>Тайтл</th><th>Розділ</th><th>Етапи</th><th>Дедлайн</th><th>Статус</th></tr>
    ${rows.map(r => {
      const d = days(r.deadline);
      return `<tr class="link" onclick="location.hash='#/chapter/${r.chapter_id}'"><td>${esc(r.title_name)}</td><td>${esc(r.number)}</td>
      <td>${STAGES.map(k => `<i class="dot ${st[r.chapter_id]?.[k] || ''}" title="${ST[k]}: ${SS[st[r.chapter_id]?.[k]] || '—'}"></i>`).join('')}</td>
      <td>${r.deadline || '—'}${d !== null ? ` <span class="muted">(${d} дн.)</span>` : ''}</td>
      <td><span class="badge ${r.health}">${HL[r.health]}</span> <span class="muted">${CS[r.status]}</span></td></tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Активних розділів немає</td></tr>'}</table></div>`;
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
    ${manage ? `<div class="row"><input id="cn" placeholder="Номер розділу"><input id="cd" type="date"><button id="cb">Додати розділ</button></div>` : ''}
    <div class="card"><table><tr><th>Розділ</th><th>Дедлайн</th><th>Статус</th></tr>
    ${(c.data || []).map(r => `<tr class="link" onclick="location.hash='#/chapter/${r.chapter_id}'"><td>${esc(r.number)}</td><td>${r.deadline || '—'}</td>
      <td><span class="badge ${r.health}">${HL[r.health]}</span> <span class="muted">${CS[r.status]}</span></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Розділів ще немає</td></tr>'}</table></div>`;
  if (manage) $('#cb').onclick = async () => {
    const number = $('#cn').value.trim();
    if (number && await q(db.from('chapters').insert({title_id: id, number, deadline: $('#cd').value || null}))) route();
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
  const [s, m] = await Promise.all([
    db.from('chapter_stages').select('*').eq('chapter_id', id),
    db.from('title_members').select('*').eq('title_id', c.title_id).eq('role_key', 'title_curator')]);
  const manage = isAdmin() || (m.data || []).some(x => x.user_id === me.id);
  const track = c.titles.kind === 'manga' ? 'bw' : 'color';
  const fits = (uid, k) => uroles.some(u => u.user_id === uid && roles.some(r => r.key === u.role_key && r.stage === k && (!r.track || r.track === track)));
  const body = STAGES.map(k => {
    const x = (s.data || []).find(z => z.stage === k) || {};
    const cand = profiles.filter(p => p.is_active && (fits(p.id, k) || p.id === x.assignee_id));
    const can = manage || x.assignee_id === me.id || (k === 'qc' && has('qc'));
    const btn = can && x.status === 'todo' ? `<button data-s="${k}" data-v="in_progress">Почати</button>`
      : can && x.status === 'in_progress' ? `<button data-s="${k}" data-v="done">Готово</button>` : '';
    return `<div class="card stage"><b>${ST[k]}</b><span class="badge ${x.status}">${SS[x.status] || '—'}</span>
      <select data-a="${k}" ${manage ? '' : 'disabled'}><option value="">— виконавець —</option>
      ${cand.map(p => `<option value="${p.id}" ${p.id === x.assignee_id ? 'selected' : ''}>${esc(p.display_name)}</option>`).join('')}</select>${btn}</div>`;
  }).join('');
  const act = c.status === 'curator_review' && manage ? '<button id="ap">Підтвердити розділ</button>'
    : c.status === 'ready_to_upload' && (has('uploader') || isAdmin()) ? '<button id="pb">Позначити викладеним</button>' : '';
  $app.innerHTML = `<p><a href="#/title/${c.title_id}">← ${esc(c.titles.name)}</a></p>
    <h2>Розділ ${esc(c.number)}</h2>
    <div class="row"><span class="badge">${CS[c.status]}</span> Дедлайн: <input type="date" id="dl" value="${c.deadline || ''}" ${manage ? '' : 'disabled'}> ${act}</div>${body}`;
  $$('[data-s]').forEach(b => b.onclick = async () => {
    if (await q(db.from('chapter_stages').update({status: b.dataset.v}).eq('chapter_id', id).eq('stage', b.dataset.s))) route();
  });
  $$('[data-a]').forEach(se => se.onchange = async () => {
    await q(db.from('chapter_stages').update({assignee_id: se.value || null}).eq('chapter_id', id).eq('stage', se.dataset.a));
    route();
  });
  $('#dl').onchange = async e => { await q(db.from('chapters').update({deadline: e.target.value || null}).eq('id', id)); route(); };
  if ($('#ap')) $('#ap').onclick = async () => { if (await q(db.rpc('approve_chapter', {c: Number(id)}))) route(); };
  if ($('#pb')) $('#pb').onclick = async () => {
    const url = prompt('Посилання на викладений розділ (можна пропустити):') || null;
    if (await q(db.rpc('mark_published', {c: Number(id), url}))) route();
  };
}

/* ---------- мої завдання ---------- */
async function mineV() {
  const {data} = await db.from('chapter_stages').select('*,chapters(id,number,deadline,titles(name))')
    .eq('assignee_id', me.id).in('status', ['todo', 'in_progress']);
  $app.innerHTML = `<h2>Мої завдання</h2>${(data || []).map(x => `<div class="card stage">
    <a href="#/chapter/${x.chapters.id}"><b style="width:auto">${esc(x.chapters.titles.name)} · розділ ${esc(x.chapters.number)}</b></a>
    <span>${ST[x.stage]}</span><span class="badge ${x.status}">${SS[x.status]}</span>
    <span class="muted">дедлайн: ${x.chapters.deadline || '—'}</span>
    <button data-c="${x.chapter_id}" data-s="${x.stage}" data-v="${x.status === 'todo' ? 'in_progress' : 'done'}">${x.status === 'todo' ? 'Почати' : 'Готово'}</button></div>`).join('')
    || '<p class="muted">Поки що завдань немає</p>'}`;
  $$('[data-c]').forEach(b => b.onclick = async () => {
    if (await q(db.from('chapter_stages').update({status: b.dataset.v}).eq('chapter_id', b.dataset.c).eq('stage', b.dataset.s))) route();
  });
}

/* ---------- люди (тільки керівництво) ---------- */
async function peopleV() {
  await loadRefs();
  const lab = k => roles.find(r => r.key === k)?.label || k;
  $app.innerHTML = `<h2>Люди</h2>${profiles.map(p => `<div class="card" style="margin-bottom:8px">
    <label><input type="checkbox" data-act="${p.id}" ${p.is_active ? 'checked' : ''}> <b>${esc(p.display_name)}</b></label>
    <div>${uroles.filter(u => u.user_id === p.id).map(u => `<span class="chip" data-ur="${p.id}|${u.role_key}">${esc(lab(u.role_key))}${u.rank ? ' · ' + u.rank : ''} ✕</span>`).join('')}</div>
    <div class="row" style="margin:6px 0 0"><select data-r="${p.id}">${roles.map(r => `<option value="${r.key}">${esc(r.label)}</option>`).join('')}</select>
    <select data-k="${p.id}"><option value="">без рангу</option><option>C</option><option>B</option><option>A</option><option>S</option></select>
    <button class="ghost" data-add="${p.id}">+ роль</button></div></div>`).join('')}`;
  $$('[data-act]').forEach(c => c.onchange = async () => { await q(db.from('profiles').update({is_active: c.checked}).eq('id', c.dataset.act)); });
  $$('[data-ur]').forEach(c => c.onclick = async () => {
    const [user_id, role_key] = c.dataset.ur.split('|');
    if (await q(db.from('user_roles').delete().match({user_id, role_key}))) peopleV();
  });
  $$('[data-add]').forEach(b => b.onclick = async () => {
    const u = b.dataset.add;
    const row = {user_id: u, role_key: $(`[data-r="${u}"]`).value, rank: $(`[data-k="${u}"]`).value || null};
    if (await q(db.from('user_roles').insert(row))) peopleV();
  });
}

boot();
