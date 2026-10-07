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
  t.push(['#/board', 'Біржа'], ['#/profile', 'Профіль']);
  if (isAdmin()) t.push(['#/people', 'Люди']);
  $top.innerHTML = `<b>PedalosTeam</b>${t.map(([h, l]) => `<a href="${h}" data-h="${h}">${l}</a>`).join('')}
    <span class="grow"></span><span class="muted">${esc(me.display_name)}</span><button class="ghost" id="out">Вийти</button>`;
  $('#out').onclick = logout;
  route();
}

/* ---------- роутер ---------- */
const views = {'': dashV, titles: titlesV, title: titleV, chapter: chapterV, mine: mineV, board: boardV, profile: profileV, people: peopleV};
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
    <div class="card"><table class="dash"><tr><th>Тайтл</th><th>Розділ</th><th>Етапи</th><th>Дедлайн</th><th>Статус</th></tr>
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
    <div class="card"><table class="chs"><tr><th>Розділ</th><th>Дедлайн</th><th>Статус</th></tr>
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
