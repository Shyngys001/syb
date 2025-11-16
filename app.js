// !!! ВАЖНО: сюда поставь URL своего Google Apps Script Web App (/exec)
const API_BASE = 'https://script.google.com/macros/s/AKfycbwIJz673mQDhmUDW1wyuCCsj97qutq1CxmE4lG9saifd7nD2J8yxTr8Go3TUmobOdv-/exec';

/* -------- Общие хелперы -------- */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function toast(node, msg, ok = true) {
  if (!node) return;
  node.classList.remove('toast--ok', 'toast--err');
  node.classList.add(ok ? 'toast--ok' : 'toast--err');
  node.textContent = msg;
  setTimeout(() => {
    if (node.textContent === msg) node.textContent = '';
  }, 3500);
}

function normalizePhone(p) {
  p = String(p || '').replace(/[^\d+]/g, '');
  if (p.startsWith('+7')) return p;
  if (p.startsWith('8') && p.length === 11) return '+7' + p.slice(1);
  if (p.length === 10) return '+7' + p;
  if (p.length === 11 && p[0] === '7') return '+' + p;
  return p;
}

async function api(action, body = {}, method = 'POST') {
  const params = new URLSearchParams(Object.entries({ action, ...body }));
  const url = method === 'GET' ? `${API_BASE}?${params.toString()}` : API_BASE;
  const resp = await fetch(url, {
    method,
    headers:
      method === 'GET'
        ? undefined
        : { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: method === 'GET' ? undefined : params.toString(),
  });
  return resp.json();
}

function downloadCSV(filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* -------- Клиентский кабинет -------- */

function initClientApp() {
  const phoneInput = $('#client-phone');
  const loginBtn = $('#client-login-btn');
  const loginToast = $('#client-login-toast');
  const mainSection = $('#client-main');

  let currentPhone = null;
  let currentProfile = null;
  let giftsList = [];

  if (!loginBtn) return;

  loginBtn.addEventListener('click', async () => {
    const phone = normalizePhone(phoneInput.value);
    if (!phone) {
      toast(loginToast, 'Введите номер телефона', false);
      return;
    }
    try {
      const r = await api('auth_user', { phone });
      if (!r.ok) {
        toast(loginToast, r.error || 'Клиент не найден', false);
        return;
      }
      currentPhone = phone;
      toast(loginToast, 'Вход выполнен', true);
      mainSection.classList.remove('hidden');
      await loadClientData();
    } catch (e) {
      toast(loginToast, e.message || String(e), false);
    }
  });

  async function loadClientData() {
    if (!currentPhone) return;
    await api('init', {}, 'POST').catch(() => {});
    const profileRes = await api('users_me', { phone: currentPhone });
    if (!profileRes.ok) {
      toast(loginToast, profileRes.error || 'Ошибка загрузки профиля', false);
      return;
    }
    currentProfile = profileRes.user;
    renderSummary(currentProfile);

    const billsRes = await api('bills_list', { phone: currentPhone }, 'GET');
    if (billsRes.ok) renderBills(billsRes.bills || []);

    const giftsRes = await api('gifts_list', {}, 'GET');
    if (giftsRes.ok) {
      giftsList = giftsRes.gifts || [];
      renderGifts(currentProfile, giftsList);
      renderProgress(currentProfile, giftsList);
    }
  }

  function createStat(label, value, hint) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    const l = document.createElement('div');
    l.className = 'stat-card__label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'stat-card__value';
    v.textContent = value;
    card.appendChild(l);
    card.appendChild(v);
    if (hint) {
      const h = document.createElement('div');
      h.className = 'stat-card__hint';
      h.textContent = hint;
      card.appendChild(h);
    }
    return card;
  }

  function renderSummary(u) {
    const box = $('#client-summary');
    box.innerHTML = '';
    box.append(
      createStat('Имя', u.name || '-', ''),
      createStat('Телефон', u.phone || '-', ''),
      createStat('Всего потрачено', `${u.lifetime_sum || 0} тг`),
      createStat('Текущий бонус', `${u.balance || 0} тг`),
      createStat(
        'Подарки',
        (u.gifts_got && u.gifts_got.length ? u.gifts_got.length : 0) + '',
        u.gifts_got && u.gifts_got.length ? u.gifts_got.join(', ') : 'Пока нет подарков'
      ),
      createStat('Статус', u.balance > 0 ? 'Активный гость' : 'Начальный уровень')
    );
  }

  function renderBills(bills) {
    const tbody = $('#client-bills-body');
    tbody.innerHTML = '';
    if (!bills.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.textContent = 'Чеки пока не добавлены.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    bills.forEach((b) => {
      const tr = document.createElement('tr');
      const tdDate = document.createElement('td');
      const tdSum = document.createElement('td');
      tdDate.textContent = b.date || '-';
      tdSum.textContent = `${b.bill || 0} тг`;
      tr.append(tdDate, tdSum);
      tbody.appendChild(tr);
    });
  }

  function renderGifts(user, gifts) {
    const grid = $('#client-gifts-grid');
    grid.innerHTML = '';
    if (!gifts.length) {
      const p = document.createElement('p');
      p.className = 'card__subtitle';
      p.textContent = 'Подарки пока не настроены.';
      grid.appendChild(p);
      return;
    }
    const balance = Number(user.balance || 0);

    gifts.forEach((g) => {
      const card = document.createElement('div');
      card.className = 'gift-card';

      // Картинка
      let imgEl;
      if (g.photo) {
        imgEl = document.createElement('img');
        imgEl.className = 'gift-card__img';
        imgEl.src = g.photo;
        imgEl.alt = g.name || '';
      } else {
        imgEl = document.createElement('div');
        imgEl.className = 'gift-card__fallback';
        imgEl.textContent = '🎁';
      }

      const meta = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'gift-card__title';
      title.textContent = g.name || 'Подарок';
      const need = document.createElement('div');
      need.className = 'gift-card__meta';
      need.textContent = `Нужно накопить: ${g.price || 0} тг`;

      meta.append(title, need);

      const actions = document.createElement('div');
      const canGet = balance >= Number(g.price || 0);
      const btn = document.createElement('button');
      btn.className = 'btn btn--sm ' + (canGet ? 'btn--primary' : 'btn--ghost');
      btn.textContent = canGet ? 'Получить' : 'Недостаточно бонуса';
      btn.disabled = !canGet;
      if (canGet) {
        btn.addEventListener('click', async () => {
          if (
            !confirm(
              `Получить «${g.name}» за ${g.price} тг бонуса? Баланс будет обнулён до новых чеков.`
            )
          )
            return;
          const res = await api('redeem', {
            phone: user.phone,
            giftName: g.name,
            actor: 'self',
          });
          if (!res.ok) {
            alert(res.error || 'Ошибка выдачи подарка');
            return;
          }
          await loadClientData();
        });
      }
      actions.appendChild(btn);

      card.append(imgEl, meta, actions);
      grid.appendChild(card);
    });
  }

  function renderProgress(user, gifts) {
    const box = $('#client-progress');
    box.innerHTML = '';

    if (!gifts.length) {
      const p = document.createElement('p');
      p.className = 'card__subtitle';
      p.textContent = 'Подарки пока не настроены.';
      box.appendChild(p);
      return;
    }

    const totalSpent = Number(user.lifetime_sum || 0);
    const sorted = [...gifts].sort((a, b) => Number(a.price) - Number(b.price));
    const nextGift = sorted.find((g) => totalSpent < Number(g.price || 0));

    if (!nextGift) {
      const p = document.createElement('p');
      p.className = 'card__subtitle';
      p.textContent = 'Вы уже достигли максимального уровня подарков. Продолжайте наслаждаться.';
      box.appendChild(p);
      return;
    }

    const need = Number(nextGift.price || 0);
    const left = Math.max(0, need - totalSpent);
    const pct = Math.min(100, (totalSpent / need) * 100);

    const row = document.createElement('div');
    row.className = 'progress-row';
    row.innerHTML = `<span>Следующий подарок: ${nextGift.name}</span><span>Осталось ~ ${left} тг</span>`;

    const track = document.createElement('div');
    track.className = 'progress-track';
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.style.width = `${pct}%`;
    track.appendChild(bar);

    box.append(row, track);
  }
}

/* -------- Админ-панель -------- */

function initAdminApp() {
  const loginCard = $('#admin-login-card');
  const adminApp = $('#admin-app');
  const loginBtn = $('#admin-login-btn');
  const loginToast = $('#admin-login-toast');

  let selectedClientPhone = null;

  if (!loginBtn) return;

  loginBtn.addEventListener('click', async () => {
    const login = $('#admin-login').value.trim();
    const password = $('#admin-password').value.trim();
    if (!login || !password) {
      toast(loginToast, 'Введите логин и пароль', false);
      return;
    }
    try {
      await api('init', {}, 'POST').catch(() => {});
      const res = await api('auth_admin', { login, password });
      if (!res.ok) {
        toast(loginToast, res.error || 'Неверные данные', false);
        return;
      }
      toast(loginToast, 'Вы вошли как администратор', true);
      loginCard.classList.add('hidden');
      adminApp.classList.remove('hidden');
      setupAdminNav();
      refreshDashboard();
      loadClients('');
      refreshGiftsAdmin();
    } catch (e) {
      toast(loginToast, e.message || String(e), false);
    }
  });

  /* Навигация по разделам */

  function setupAdminNav() {
    const links = $$('.sidebar__link');
    const sections = $$('.admin-section');

    function showSection(name) {
      sections.forEach((s) => {
        s.classList.toggle('hidden', s.dataset.section !== name);
      });
      links.forEach((l) => {
        l.classList.toggle('sidebar__link--active', l.dataset.section === name);
      });
    }

    links.forEach((link) => {
      link.addEventListener('click', () => {
        const name = link.dataset.section;
        showSection(name);
        if (name === 'dashboard') refreshDashboard();
        if (name === 'analytics') renderAnalytics();
      });
    });

    // быстрые кнопки
    $$('.quick-actions [data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.jump;
        showSection(name);
        if (name === 'analytics') renderAnalytics();
      });
    });
  }

  /* DASHBOARD */

  async function refreshDashboard() {
    const box = $('#dash-stats');
    box.innerHTML = '';
    try {
      const usersRes = await api('users_list', {}, 'GET');
      if (!usersRes.ok) throw new Error(usersRes.error || 'Ошибка');
      const users = usersRes.users || [];

      let total = 0;
      let giftsCount = 0;

      for (const u of users) {
        const prof = await api('users_me', { phone: u.phone });
        if (prof.ok) {
          const user = prof.user;
          total += Number(user.lifetime_sum || 0);
          giftsCount += (user.gifts_got || []).length;
        }
      }

      const avg = users.length ? Math.round(total / users.length) : 0;

      box.append(
        createStat('Клиентов в базе', users.length),
        createStat('Оборот по всем чекам', `${total.toLocaleString('ru-RU')} тг`),
        createStat('Средний оборот на клиента', `${avg.toLocaleString('ru-RU')} тг`),
        createStat('Выдано подарков', giftsCount),
        createStat(
          'Средний чек до подарка',
          users.length ? '~ ' + Math.round(total / Math.max(1, giftsCount || 1)) + ' тг' : '—'
        ),
        createStat('Статус системы', 'Активна')
      );
    } catch (e) {
      box.append(createStat('Ошибка', 'Не удалось загрузить дашборд'));
    }
  }

  function createStat(label, value, hint) {
    const card = document.createElement('div');
    card.className = 'stat-card';
    const l = document.createElement('div');
    l.className = 'stat-card__label';
    l.textContent = label;
    const v = document.createElement('div');
    v.className = 'stat-card__value';
    v.textContent = value;
    card.append(l, v);
    if (hint) {
      const h = document.createElement('div');
      h.className = 'stat-card__hint';
      h.textContent = hint;
      card.appendChild(h);
    }
    return card;
  }

  /* КЛИЕНТЫ */

  const clientSearchInput = $('#client-search');
  const clientListBox = $('#client-list');
  const clientCreateBtn = $('#client-create-btn');

  clientCreateBtn.addEventListener('click', async () => {
    const name = $('#client-create-name').value.trim();
    const phone = normalizePhone($('#client-create-phone').value);
    if (!name || !phone) {
      alert('Введите имя и телефон');
      return;
    }
    const res = await api('users_create', { name, phone });
    if (!res.ok) {
      alert(res.error || 'Ошибка создания клиента');
      return;
    }
    $('#client-create-name').value = '';
    $('#client-create-phone').value = '';
    loadClients(clientSearchInput.value);
    refreshDashboard();
  });

  clientSearchInput.addEventListener('input', () => {
    loadClients(clientSearchInput.value);
  });

  async function loadClients(query) {
    const res = await api('users_list', { query: query || '' }, 'GET');
    clientListBox.innerHTML = '';
    if (!res.ok) {
      clientListBox.innerHTML = '<div class="card__subtitle">Ошибка загрузки клиентов.</div>';
      return;
    }
    const users = res.users || [];
    if (!users.length) {
      clientListBox.innerHTML = '<div class="card__subtitle">Клиенты не найдены.</div>';
      return;
    }
    users.forEach((u) => {
      const item = document.createElement('div');
      item.className = 'list-item';
      const left = document.createElement('div');
      left.innerHTML = `<div class="list-item__name">${u.name}</div><div class="list-item__phone">${u.phone}</div>`;
      const gift = document.createElement('div');
      gift.className = 'list-item__phone';
      gift.textContent = u.gift || '';
      item.append(left, gift);
      item.addEventListener('click', () => selectClient(u.phone));
      clientListBox.appendChild(item);
    });
  }

  async function selectClient(phone) {
    selectedClientPhone = phone;
    $('#client-current-phone').textContent = phone;

    const prof = await api('users_me', { phone });
    if (!prof.ok) {
      alert(prof.error || 'Ошибка профиля');
      return;
    }
    const u = prof.user;
    renderClientSummary(u);

    const billsRes = await api('bills_list', { phone }, 'GET');
    if (billsRes.ok) renderClientBills(billsRes.bills || []);
  }

  function renderClientSummary(u) {
    const box = $('#client-detail-summary');
    box.innerHTML = '';
    box.append(
      createStat('Имя', u.name || '-'),
      createStat('Телефон', u.phone || '-'),
      createStat('Всего чеков', `${u.lifetime_sum || 0} тг`),
      createStat('Текущий бонус', `${u.balance || 0} тг`),
      createStat(
        'Подарки',
        (u.gifts_got && u.gifts_got.length ? u.gifts_got.length : 0) + '',
        u.gifts_got && u.gifts_got.length ? u.gifts_got.join(', ') : 'Пока нет'
      ),
      createStat('Сегмент', u.lifetime_sum > 0 ? 'Постоянный гость' : 'Новый гость')
    );
  }

  function renderClientBills(bills) {
    const tbody = $('#client-detail-bills');
    tbody.innerHTML = '';
    if (!bills.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 2;
      td.textContent = 'Чеки не найдены.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }
    bills.forEach((b) => {
      const tr = document.createElement('tr');
      const tdD = document.createElement('td');
      const tdS = document.createElement('td');
      tdD.textContent = b.date || '-';
      tdS.textContent = `${b.bill || 0} тг`;
      tr.append(tdD, tdS);
      tbody.appendChild(tr);
    });
  }

  $('#client-bill-add-btn').addEventListener('click', async () => {
    if (!selectedClientPhone) {
      alert('Сначала выберите клиента из списка.');
      return;
    }
    const amount = parseFloat($('#client-bill-amount').value);
    if (isNaN(amount)) {
      alert('Введите сумму чека.');
      return;
    }
    const res = await api('bills_add', { phone: selectedClientPhone, bill: amount });
    if (!res.ok) {
      alert(res.error || 'Ошибка добавления чека');
      return;
    }
    $('#client-bill-amount').value = '';
    await selectClient(selectedClientPhone);
    await refreshDashboard();
  });

  /* ПОДАРКИ */

  const giftCreateBtn = $('#gift-create-btn');

  giftCreateBtn.addEventListener('click', async () => {
    const name = $('#gift-name').value.trim();
    const price = parseFloat($('#gift-price').value);
    const photo = $('#gift-photo').value.trim();
    if (!name) {
      alert('Название подарка обязательно');
      return;
    }
    const res = await api('gifts_create', {
      name,
      price: isNaN(price) ? 0 : price,
      photo,
    });
    if (!res.ok) {
      alert(res.error || 'Ошибка создания подарка');
      return;
    }
    $('#gift-name').value = '';
    $('#gift-price').value = '';
    $('#gift-photo').value = '';
    refreshGiftsAdmin();
  });

  async function refreshGiftsAdmin() {
    const cont = $('#gift-list-admin');
    cont.innerHTML = '';
    const res = await api('gifts_list', {}, 'GET');
    if (!res.ok) {
      cont.innerHTML = '<div class="card__subtitle">Ошибка загрузки подарков.</div>';
      return;
    }
    const gifts = res.gifts || [];
    if (!gifts.length) {
      cont.innerHTML = '<div class="card__subtitle">Подарки не настроены.</div>';
      return;
    }
    gifts.forEach((g) => {
      const card = document.createElement('div');
      card.className = 'gift-card';

      let imgEl;
      if (g.photo) {
        imgEl = document.createElement('img');
        imgEl.className = 'gift-card__img';
        imgEl.src = g.photo;
        imgEl.alt = g.name || '';
      } else {
        imgEl = document.createElement('div');
        imgEl.className = 'gift-card__fallback';
        imgEl.textContent = '🎁';
      }

      const meta = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'gift-card__title';
      title.textContent = g.name || 'Подарок';
      const price = document.createElement('div');
      price.className = 'gift-card__meta';
      price.textContent = `Минимальная сумма чеков: ${g.price || 0} тг`;
      const clients = document.createElement('div');
      clients.className = 'gift-card__clients';
      clients.textContent = g.user_got
        ? `Клиенты: ${g.user_got}`
        : 'Пока никто не получил';

      meta.append(title, price, clients);

      const actions = document.createElement('div');
      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn--ghost btn--sm';
      editBtn.textContent = 'Изменить';
      editBtn.addEventListener('click', async () => {
        const newPrice = prompt('Новая цена (пусто — без изменения):', g.price);
        const newPhoto = prompt('URL фото (пусто — без изменения):', g.photo || '');
        const body = { name: g.name };
        if (newPrice !== null && newPrice.trim() !== '') body.price = newPrice;
        if (newPhoto !== null && newPhoto.trim() !== '') body.photo = newPhoto;
        const r2 = await api('gifts_update', body);
        if (!r2.ok) {
          alert(r2.error || 'Ошибка обновления');
          return;
        }
        refreshGiftsAdmin();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn--danger btn--sm';
      delBtn.textContent = 'Удалить';
      delBtn.addEventListener('click', async () => {
        if (!confirm(`Удалить подарок «${g.name}»?`)) return;
        const r3 = await api('gifts_delete', { name: g.name });
        if (!r3.ok) {
          alert(r3.error || 'Ошибка удаления');
          return;
        }
        refreshGiftsAdmin();
      });

      actions.append(editBtn, delBtn);

      card.append(imgEl, meta, actions);
      cont.appendChild(card);
    });
  }

  // Ручная выдача подарка
  $('#redeem-gift-btn').addEventListener('click', async () => {
    const phone = normalizePhone($('#redeem-phone').value);
    const giftName = $('#redeem-gift-name').value.trim();
    if (!phone || !giftName) {
      alert('Телефон и название подарка обязательны');
      return;
    }
    if (
      !confirm(
        `Выдать подарок «${giftName}» клиенту ${phone}? Баланс будет обнулён до новых чеков.`
      )
    )
      return;
    const res = await api('redeem', { phone, giftName, actor: 'admin' });
    if (!res.ok) {
      alert(res.error || 'Ошибка выдачи подарка');
      return;
    }
    alert('Подарок выдан');
    if (selectedClientPhone === phone) {
      await selectClient(phone);
    }
    await refreshGiftsAdmin();
    await refreshDashboard();
  });

  /* АНАЛИТИКА */

  $('#analytics-rebuild-btn').addEventListener('click', async () => {
    const res = await api('analytics_rebuild', {}, 'POST');
    if (!res.ok) {
      alert(res.error || 'Ошибка пересчёта analytics');
      return;
    }
    alert('Лист analytics пересчитан');
    renderAnalytics();
  });

  async function renderAnalytics() {
    const statsBox = $('#analytics-stats');
    const tableBox = $('#analytics-table-container');
    statsBox.innerHTML = '';
    tableBox.innerHTML = '';

    const usersRes = await api('users_list', {}, 'GET');
    if (!usersRes.ok) {
      statsBox.innerHTML = '<div class="card__subtitle">Ошибка загрузки данных.</div>';
      return;
    }
    const users = usersRes.users || [];
    const rows = [];
    let total = 0;
    let giftsCount = 0;

    for (const u of users) {
      const p = await api('users_me', { phone: u.phone });
      if (p.ok) {
        const user = p.user;
        rows.push({
          name: user.name,
          phone: user.phone,
          sum: user.lifetime_sum || 0,
          gifts: (user.gifts_got || []).join(', '),
        });
        total += Number(user.lifetime_sum || 0);
        giftsCount += (user.gifts_got || []).length;
      }
    }

    const avg = rows.length ? Math.round(total / rows.length) : 0;

    statsBox.append(
      createStat('Всего клиентов', rows.length),
      createStat('Суммарный оборот', `${total.toLocaleString('ru-RU')} тг`),
      createStat('Средний оборот на клиента', `${avg.toLocaleString('ru-RU')} тг`),
      createStat('Всего подарков выдано', giftsCount)
    );

    if (!rows.length) {
      tableBox.innerHTML = '<div class="card__subtitle">Данных по клиентам пока нет.</div>';
      return;
    }

    const table = document.createElement('table');
    table.className = 'table';
    const thead = document.createElement('thead');
    thead.innerHTML =
      '<tr><th>Имя</th><th>Телефон</th><th>Сумма чеков</th><th>Подарки</th></tr>';
    const tbody = document.createElement('tbody');

    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.name}</td><td>${r.phone}</td><td>${r.sum}</td><td>${
        r.gifts || '—'
      }</td>`;
      tbody.appendChild(tr);
    });

    table.append(thead, tbody);
    tableBox.appendChild(table);
  }

  /* ЭКСПОРТ */

  async function doExport(kind) {
    const res = await api('export_csv', { kind }, 'GET');
    if (!res.ok) {
      alert(res.error || 'Ошибка экспорта');
      return;
    }
    downloadCSV(`${kind}.csv`, res.csv || '');
  }

  $('#export-users-btn').addEventListener('click', () => doExport('users'));
  $('#export-bills-btn').addEventListener('click', () => doExport('bills'));
  $('#export-gifts-btn').addEventListener('click', () => doExport('gifts'));
  $('#export-redeem-btn').addEventListener('click', () => doExport('redeem_log'));
}

/* -------- Auto init -------- */

document.addEventListener('DOMContentLoaded', async () => {
  const appType = document.body.dataset.app;
  if (appType === 'client') initClientApp();
  if (appType === 'admin') initAdminApp();
});