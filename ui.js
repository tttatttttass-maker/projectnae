import { CONFIG, MODELS, TASKS, HOTSPOTS, money } from './models-data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const byId = (id) => MODELS.find((m) => m.id === id);
const root = document.documentElement;
const state = { id: MODELS[0].id, task: null, viewer: null };

/* ---------- живой фон: параллакс с инерцией ---------- */
let tx = 0, ty = 0, cx = 0, cy = 0;
addEventListener('pointermove', (e) => { tx = e.clientX / innerWidth - .5; ty = e.clientY / innerHeight - .5; }, { passive: true });
(function loop() {
  cx += (tx - cx) * .06; cy += (ty - cy) * .06;
  root.style.setProperty('--mx', cx.toFixed(4)); root.style.setProperty('--my', cy.toFixed(4));
  requestAnimationFrame(loop);
})();

/* ---------- витрина: вкладки, характеристики, цена ---------- */
function renderTabs() {
  $('#tabs').innerHTML = MODELS.map((m) => `<button class="tab" data-id="${m.id}" style="--c:${m.accent}"><b>${m.name}</b><span>${m.tag}</span></button>`).join('');
  $('#tabs').addEventListener('click', (e) => { const b = e.target.closest('.tab'); if (b) select(b.dataset.id); });
}

function renderInfo() {
  const m = byId(state.id), n = CONFIG.installmentMonths;
  $('#info').innerHTML = `
    <h3>${m.name}</h3><p class="tag">${m.tag}</p><p class="desc">${m.desc}</p>
    <dl class="specs">${m.specs.map(([k, v]) => `<div><dt>${k}</dt><dd class="mono">${v}</dd></div>`).join('')}</dl>
    <div>${m.fps.map(([k, v]) => `<div class="row"><span>${k}</span><div class="bar"><i style="--w:${Math.min(100, (v / 700) * 100)}%"></i></div><b class="mono">${v}</b></div>`).join('')}</div>
    <div class="kpis mono"><span>CPU ${m.temp[0]} °C</span><span>GPU ${m.temp[1]} °C</span><span>${m.noise} дБ</span></div>
    <div class="buy"><div><div class="price mono">${money(m.price)}</div><small class="mono">или ${money(m.price / n)} в месяц, ${n} мес.</small></div>
    <a class="btn" href="#order">Заказать сборку</a></div>`;
  $('#info').style.animation = 'none'; void $('#info').offsetWidth; $('#info').style.animation = '';
}

function select(id) {
  const m = byId(id); state.id = id;
  root.style.setProperty('--acc', m.accent);
  $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.id === id));
  renderInfo(); $('#hsCard').hidden = true;
  state.viewer?.setModel(m);
  syncForm();
}

/* ---------- хотспоты ---------- */
function showCard(id) {
  const h = HOTSPOTS.find((x) => x.id === id), m = byId(state.id), c = $('#hsCard');
  const spec = h.spec.map((k) => m.specs.find((s) => s[0] === k)?.[1]).filter(Boolean).join(', ');
  c.innerHTML = `<button class="x" aria-label="Закрыть">×</button><h4>${h.title}</h4><p>${h.text}</p><p class="mono">${spec}</p>`;
  c.hidden = false; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
}
$('#hsCard').addEventListener('click', (e) => { if (e.target.closest('.x')) e.currentTarget.hidden = true; });
addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#hsCard').hidden = true; });

/* ---------- режимы просмотра ---------- */
$('.modes').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.mode) { $$('[data-mode]').forEach((x) => x.classList.toggle('on', x === b)); state.viewer?.setLook(b.dataset.mode); }
  else { b.classList.toggle('on'); state.viewer?.[b.dataset.toggle === 'air' ? 'setAirflow' : 'setPanel'](b.classList.contains('on')); }
});

/* ---------- подбор по задаче ---------- */
function renderTasks() {
  $('#taskList').innerHTML = TASKS.map((t) => `<button class="card task" data-task="${t.id}"><svg viewBox="0 0 64 64" aria-hidden="true">${t.icon}</svg><h3>${t.title}</h3><p>${t.desc}</p><span class="mono">Подойдут: ${t.picks.map((i) => byId(i).name).join(', ')}</span></button>`).join('');
  $('#taskList').addEventListener('click', (e) => {
    const b = e.target.closest('.task'); if (!b) return;
    const t = TASKS.find((x) => x.id === b.dataset.task); state.task = t.id;
    $$('.task').forEach((el) => el.classList.toggle('on', el === b));
    $$('.tab').forEach((el) => el.classList.toggle('rec', t.picks.includes(el.dataset.id)));
    select(t.picks[0]);
    $('#showroom').scrollIntoView({ behavior: 'smooth' });
  });
}

/* ---------- форма заявки ---------- */
const rules = {
  name: (v) => v.trim().length >= 2 || 'Укажите имя, минимум 2 символа',
  phone: (v) => /^\+?\d[\d\s()-]{8,16}\d$/.test(v.trim()) || 'Введите телефон, например +7 700 000 00 00',
  model: (v) => !!v || 'Выберите сборку',
};
const check = (el) => {
  const res = rules[el.name](el.value), box = el.closest('.f');
  box.classList.toggle('bad', res !== true); box.querySelector('.err').textContent = res === true ? '' : res;
  return res === true;
};
/* Бэкенда локально нет, поэтому отправка имитируется. Для реального сервера: fetch('/api/orders', { method: 'POST', body: JSON.stringify(data) }) */
const sendOrder = (data) => new Promise((ok) => setTimeout(() => { console.info('Заявка:', data); ok(); }, 700));

function syncForm() {
  const m = byId(state.id);
  $('#fModel').value = m.id; $('#fTask').value = state.task || m.task;
  $('#orderSum').textContent = `${m.name}, ${money(m.price)}`;
}

function initForm() {
  const form = $('#orderForm');
  $('#fModel').innerHTML = MODELS.map((m) => `<option value="${m.id}">${m.name}: ${m.tag}</option>`).join('');
  $('#fTask').innerHTML = TASKS.map((t) => `<option value="${t.id}">${t.title}</option>`).join('');
  $('#fModel').addEventListener('change', (e) => select(e.target.value));
  form.addEventListener('focusout', (e) => rules[e.target.name] && check(e.target));
  form.addEventListener('input', (e) => e.target.closest('.bad') && check(e.target));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = [...form.elements].filter((el) => rules[el.name]).map(check).every(Boolean);
    if (!ok) return form.querySelector('.bad input, .bad select')?.focus();
    const data = Object.fromEntries(new FormData(form)), btn = form.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Отправляем…';
    await sendOrder(data);
    form.innerHTML = '<div class="ok" role="status"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" opacity=".3"/><path d="M19 33l9 9 18-20"/></svg><h3>Заявка принята</h3><p class="lead"></p></div>';
    form.querySelector('.lead').textContent = `${data.name.trim()}, мы позвоним на ${data.phone.trim()} в течение 30 минут и согласуем конфигурацию ${byId(data.model).name}.`;
  });
}

/* ---------- 3D с аккуратным резервным состоянием ---------- */
const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };

function fallback(why) {
  $('#loading')?.remove();
  $('#fbText').textContent = `3D-просмотр сейчас недоступен. ${why} Характеристики, цены и заявка работают как обычно.`;
  $('#fbChips').innerHTML = HOTSPOTS.map((h) => `<button data-hs="${h.id}">${h.title}</button>`).join('');
  $('#fbChips').onclick = (e) => { const b = e.target.closest('[data-hs]'); if (b) showCard(b.dataset.hs); };
  $('#fallback').hidden = false; $('.modes').hidden = true;
}

async function initViewer() {
  let why = 'Браузер не поддерживает WebGL.';
  try {
    if (!hasWebGL()) throw new Error(why);
    why = 'Не удалось загрузить Three.js с CDN, проверьте интернет.';
    const { Viewer } = await import('./three-scene.js');
    why = 'Не удалось создать 3D-сцену.';
    state.viewer = new Viewer($('#viewer'), { hotspots: HOTSPOTS, onHotspot: showCard });
    state.viewer.setModel(byId(state.id), true);
    $('#loading')?.remove();
  } catch (err) { console.warn('[3D]', err); state.viewer = null; fallback(why); }
}

/* ---------- старт ---------- */
$$('[data-installment]').forEach((el) => (el.textContent = CONFIG.installmentMonths));
renderTabs(); renderTasks(); initForm(); select(state.id); initViewer();
