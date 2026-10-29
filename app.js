(() => {
  'use strict';

  const STORAGE_KEY = 'teharenda.state.v2';
  const UNLOCK_KEY = 'teharenda.owner.unlocked';
  const DATA_URL = 'data.json';

  const STATUS = {
    free: { label: 'Свободен', cls: 'is-free', hint: '' },
    busy: {
      label: 'Занят',
      cls: 'is-busy',
      hint: 'Сейчас техника занята — владелец предложит ближайшую свободную дату.'
    },
    check: {
      label: 'Требует подтверждения',
      cls: 'is-check',
      hint: 'Доступность на выбранную дату подтвердит владелец.'
    }
  };
  const STATUS_ORDER = ['free', 'busy', 'check'];

  const DEFAULT_ZONES = [
    { id: 'z1', name: 'Город', price: 3000 },
    { id: 'z2', name: 'До 30 км', price: 5000 },
    { id: 'z3', name: 'До 60 км', price: 8000 }
  ];

  const makeDefaultZones = () => DEFAULT_ZONES.map(zone => ({ ...zone }));

  const DEFAULT_STATE = {
    ownerPin: '2580',
    tgUsername: 'aeiupov',
    equipment: [
      {
        id: 'mini',
        name: 'Мини-экскаватор',
        desc: 'Земляные и погрузочные работы на участке: траншеи, фундамент, планировка.',
        img: 'assets/img/mini.jpg',
        imgPos: 'center 58%',
        rate: 2500,
        minHours: 4,
        status: 'free',
        zones: makeDefaultZones()
      },
      {
        id: 'manipulator',
        name: 'Кран-манипулятор',
        desc: 'Погрузка, разгрузка и монтаж грузов до 7 тонн.',
        img: 'assets/img/manipulator.jpg',
        imgPos: 'center 55%',
        rate: 3500,
        minHours: 4,
        status: 'free',
        zones: makeDefaultZones()
      },
      {
        id: 'crane25',
        name: 'Автокран',
        desc: 'Монтаж металлоконструкций и подъём тяжёлых грузов до 25 тонн.',
        img: 'assets/img/crane25.jpg',
        imgPos: 'center 55%',
        rate: 6000,
        minHours: 4,
        status: 'check',
        zones: makeDefaultZones()
      }
    ]
  };

  const clone = value => JSON.parse(JSON.stringify(value));

  const numberInRange = (value, fallback, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };

  function normalizeZones(source, defaults) {
    const list = Array.isArray(source) ? source : [];
    return defaults.map((def, index) => {
      const item = list.find(entry => entry && entry.id === def.id) || list[index] || def;
      const name = typeof item.name === 'string' && item.name.trim()
        ? item.name.trim().slice(0, 40)
        : def.name;
      return {
        id: def.id,
        name,
        price: Math.round(numberInRange(item.price, def.price, 0, 1000000))
      };
    });
  }

  function normalizeState(source) {
    const fallback = clone(DEFAULT_STATE);
    if (!source || typeof source !== 'object') return fallback;

    const equipment = fallback.equipment.map(def => {
      const item = Array.isArray(source.equipment)
        ? source.equipment.find(entry => entry && entry.id === def.id)
        : null;
      if (!item) return def;
      return {
        ...def,
        rate: Math.round(numberInRange(item.rate, def.rate, 0, 1000000)),
        minHours: Math.round(numberInRange(item.minHours, def.minHours, 1, 24)),
        status: STATUS_ORDER.includes(item.status) ? item.status : def.status,
        zones: normalizeZones(item.zones, def.zones)
      };
    });

    const username = typeof source.tgUsername === 'string'
      ? normalizeUsername(source.tgUsername)
      : DEFAULT_STATE.tgUsername;

    const pin = typeof source.ownerPin === 'string' ? source.ownerPin.trim() : '';
    const ownerPin = /^\d{4,12}$/.test(pin) ? pin : fallback.ownerPin;

    return {
      ownerPin,
      tgUsername: username,
      equipment
    };
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? normalizeState(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      hasDraft = true;
    } catch {
      /* localStorage may be unavailable in private mode */
    }
    renderPublish();
  }

  function clearDraft() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* localStorage may be unavailable in private mode */
    }
    hasDraft = false;
    renderPublish();
  }

  async function fetchRemoteState() {
    // На file:// браузер не отдаёт data.json — работаем с черновиком или значениями по умолчанию.
    if (location.protocol === 'file:') return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`${DATA_URL}?v=${Date.now()}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (!response.ok) return null;
      return normalizeState(await response.json());
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  function editableSettings(source = state) {
    return JSON.stringify({
      ownerPin: source.ownerPin,
      tgUsername: source.tgUsername,
      equipment: source.equipment.map(item => ({
        id: item.id,
        rate: item.rate,
        minHours: item.minHours,
        status: item.status,
        zones: item.zones.map(zone => ({ id: zone.id, name: zone.name, price: zone.price }))
      }))
    });
  }

  function publishedPayload() {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      ...JSON.parse(editableSettings())
    };
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const els = {
    clientView: $('#clientView'),
    ownerView: $('#ownerView'),
    ownerLogin: $('#ownerLogin'),
    backLink: $('#backLink'),
    grid: $('#equipmentGrid'),
    address: $('#address'),
    zone: $('#zone'),
    date: $('#date'),
    time: $('#time'),
    hours: $('#hours'),
    comment: $('#comment'),
    hoursHint: $('#hoursHint'),
    estImg: $('#estImg'),
    estName: $('#estName'),
    estStatus: $('#estStatus'),
    estWhen: $('#estWhen'),
    estAddress: $('#estAddress'),
    estWorkLabel: $('#estWorkLabel'),
    estWorkValue: $('#estWorkValue'),
    estDeliveryLabel: $('#estDeliveryLabel'),
    estDelivery: $('#estDelivery'),
    estTotal: $('#estTotal'),
    estHint: $('#estHint'),
    tgBtn: $('#tgBtn'),
    tgHint: $('#tgHint'),
    tgDialog: $('#tgDialog'),
    tgDialogText: $('#tgDialogText'),
    tgDialogUser: $('#tgDialogUser'),
    tgOpen: $('#tgOpen'),
    tgCopy: $('#tgCopy'),
    tgShare: $('#tgShare'),
    tgClose: $('#tgClose'),
    ownerMachines: $('#ownerMachines'),
    tgUsername: $('#tgUsername'),
    ownerPinInput: $('#ownerPinInput'),
    lockBtn: $('#lockBtn'),
    loginForm: $('#loginForm'),
    ownerPin: $('#ownerPin'),
    loginError: $('#loginError'),
    publishState: $('#publishState'),
    exportBtn: $('#exportBtn'),
    verifyBtn: $('#verifyBtn'),
    publishHint: $('#publishHint'),
    toast: $('#toast'),
    year: $('#year')
  };

  let state = clone(DEFAULT_STATE);
  let hasDraft = false;
  let selectedId = null;
  let selectedZoneId = null;
  let currentView = null;
  let toastTimer = null;
  let pendingRequest = '';

  const nf = new Intl.NumberFormat('ru-RU');
  const money = value => `${nf.format(Math.round(value))} ₽`;
  const plain = value => nf.format(Math.round(value));

  const selectedEquipment = () => state.equipment.find(item => item.id === selectedId) || null;
  const selectedZone = () => {
    const equipment = selectedEquipment();
    if (!equipment) return null;
    return equipment.zones.find(zone => zone.id === selectedZoneId) || equipment.zones[0];
  };
  const equipmentById = id => state.equipment.find(item => item.id === id);

  function ensureSelection() {
    if (!selectedId || !equipmentById(selectedId)) return;
    const equipment = selectedEquipment();
    if (!equipment.zones.some(zone => zone.id === selectedZoneId)) {
      selectedZoneId = equipment.zones[0].id;
    }
  }

  const escapeHtml = value => String(value).replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])
  );

  const pad = n => String(n).padStart(2, '0');
  const isoDate = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const isoToday = () => isoDate(new Date());
  const isoTomorrow = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    return isoDate(date);
  };

  function formatDate(value) {
    if (!value) return '';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '');
  }

  function toast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2600);
  }

  function readForm() {
    const hours = Number(els.hours.value);
    return {
      address: els.address.value.trim(),
      date: els.date.value,
      time: els.time.value,
      hours: Number.isFinite(hours) ? hours : 0,
      comment: els.comment.value.trim()
    };
  }

  function calculate(equipment, hours, zone) {
    const requested = hours > 0 ? hours : equipment.minHours;
    const billable = Math.max(requested, equipment.minHours);
    const work = billable * equipment.rate;
    return {
      requested,
      billable,
      work,
      delivery: zone.price,
      total: work + zone.price,
      belowMinimum: requested < equipment.minHours
    };
  }

  function priceRange(total) {
    const low = Math.floor(total / 500) * 500;
    // Верхняя граница всегда выше +10%: для 30 000 ₽ это 33 500 ₽.
    const high = Math.floor((total * 1.1) / 500) * 500 + 500;
    return `от ${plain(low)} до ${plain(high)} ₽`;
  }

  function deliveryRangeLabel(equipment) {
    const prices = equipment.zones.map(zone => zone.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? money(min) : `от ${money(min)}`;
  }

  /* ---------- Client: catalog ---------- */

  function renderCatalog() {
    els.grid.innerHTML = state.equipment
      .map(item => {
        const status = STATUS[item.status];
        const selected = item.id === selectedId;
        return `
          <article class="machine-card${selected ? ' is-selected' : ''}">
            <div class="machine-media">
              <img src="${item.img}" alt="${item.name}" loading="lazy" style="object-position:${item.imgPos}">
              <span class="status-badge ${status.cls}"><i></i>${status.label}</span>
            </div>
            <div class="machine-body">
              <h3>${item.name}</h3>
              <p class="machine-desc">${item.desc}</p>
              <div class="machine-price"><strong>${money(item.rate)}</strong><span>/ час</span></div>
              <dl class="machine-specs">
                <div><dt>Мин. смена</dt><dd>${item.minHours} ч</dd></div>
                <div><dt>Доставка</dt><dd>${deliveryRangeLabel(item)}</dd></div>
              </dl>
              <button class="btn ${selected ? 'btn-selected' : 'btn-primary'}" type="button" data-select="${item.id}">
                ${selected ? 'Выбрано — к заявке' : 'Выбрать и рассчитать'}
              </button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function selectMachine(id, scrollToForm) {
    if (!equipmentById(id)) return;
    selectedId = id;
    const equipment = selectedEquipment();

    if (!equipment.zones.some(zone => zone.id === selectedZoneId)) {
      selectedZoneId = equipment.zones[0].id;
    }

    els.hours.min = String(equipment.minHours);
    if (!els.hours.value || Number(els.hours.value) < equipment.minHours) {
      els.hours.value = String(equipment.minHours);
    }
    els.hoursHint.textContent = `Минимальная смена — ${equipment.minHours} ч`;

    renderCatalog();
    renderZoneOptions();
    renderEstimate();

    if (scrollToForm) {
      document.getElementById('request').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ---------- Client: estimate ---------- */

  function buildRequestText(form = readForm()) {
    const equipment = selectedEquipment();
    const zone = selectedZone();
    const status = STATUS[equipment.status];
    const calc = calculate(equipment, form.hours, zone);
    const when = form.date
      ? `${formatDate(form.date)}${form.time ? `, ${form.time}` : ''}`
      : 'не указана';

    const lines = [
      'Здравствуйте! Хочу заказать спецтехнику.',
      '',
      `Техника: ${equipment.name}`,
      `Доступность: ${status.label}`,
      `Дата и время: ${when}`,
      form.hours < equipment.minHours
        ? `Продолжительность: ${calc.billable} ч (минимальная смена ${equipment.minHours} ч)`
        : `Продолжительность: ${calc.billable} ч`,
      `Адрес объекта: ${form.address || 'не указан'}`,
      `Зона доставки: ${zone.name}`,
      '',
      `Работа: ${calc.billable} ч × ${money(equipment.rate)} = ${money(calc.work)}`,
      `Доставка: ${money(calc.delivery)}`,
      `Предварительная стоимость: ${priceRange(calc.total)}`
    ];

    if (form.comment) {
      lines.push('', `Комментарий: ${form.comment}`);
    }

    return lines.join('\n');
  }

  function renderEmptyEstimate(form) {
    els.estImg.hidden = true;
    els.estStatus.hidden = true;
    els.estName.textContent = 'Техника не выбрана';

    els.estWhen.textContent = form.date
      ? `${formatDate(form.date)}${form.time ? `, ${form.time}` : ''}`
      : 'Дата не выбрана';

    els.estAddress.textContent = form.address || 'Укажите адрес';
    els.estAddress.classList.toggle('is-placeholder', !form.address);

    els.estWorkLabel.textContent = 'Работа';
    els.estWorkValue.textContent = '—';
    els.estDeliveryLabel.textContent = 'Доставка';
    els.estDelivery.textContent = '—';
    els.estTotal.textContent = '—';

    els.estHint.textContent = 'Выберите технику в каталоге — стоимость посчитается сразу.';
    els.estHint.classList.add('is-visible');

    els.tgBtn.disabled = true;
    els.tgHint.textContent = '';
    els.tgHint.classList.remove('is-visible');
  }

  function renderEstimate() {
    const form = readForm();
    const equipment = selectedEquipment();

    if (!equipment) {
      renderEmptyEstimate(form);
      return;
    }

    const zone = selectedZone();
    const status = STATUS[equipment.status];
    const calc = calculate(equipment, form.hours, zone);

    els.estImg.hidden = false;
    els.estStatus.hidden = false;
    els.estImg.src = equipment.img;
    els.estImg.alt = equipment.name;
    els.estName.textContent = equipment.name;
    els.estStatus.className = `status-badge ${status.cls}`;
    els.estStatus.textContent = status.label;

    els.estWhen.textContent = form.date
      ? `${formatDate(form.date)}${form.time ? `, ${form.time}` : ''}`
      : 'Дата не выбрана';

    els.estAddress.textContent = form.address || 'Укажите адрес';
    els.estAddress.classList.toggle('is-placeholder', !form.address);

    els.estWorkLabel.textContent = `Работа · ${calc.billable} ч × ${plain(equipment.rate)} ₽`;
    els.estWorkValue.textContent = money(calc.work);
    els.estDeliveryLabel.textContent = `Доставка · ${zone.name}`;
    els.estDelivery.textContent = money(calc.delivery);
    els.estTotal.textContent = priceRange(calc.total);

    const hints = [];
    if (!form.hours) {
      hints.push(`Минимальная смена — ${equipment.minHours} ч.`);
    } else if (calc.belowMinimum) {
      hints.push(`Стоимость рассчитана за минимальную смену ${equipment.minHours} ч.`);
    }
    if (status.hint) hints.push(status.hint);
    els.estHint.textContent = hints.join(' ');
    els.estHint.classList.toggle('is-visible', hints.length > 0);

    const hasTelegram = Boolean(state.tgUsername);
    els.tgBtn.disabled = !hasTelegram;
    if (hasTelegram) {
      els.tgHint.textContent = '';
    } else {
      els.tgHint.innerHTML = 'Укажите <a href="#owner">Telegram в панели владельца</a> — после этого отправка заработает.';
    }
    els.tgHint.classList.toggle('is-visible', !hasTelegram);
  }

  /* ---------- Client: validation & submission ---------- */

  const FIELD_SELECTORS = {
    address: '#address',
    date: '#date',
    time: '#time',
    hours: '#hours'
  };

  function setErrors(errors) {
    Object.entries(FIELD_SELECTORS).forEach(([key, selector]) => {
      const input = $(selector);
      const message = errors[key] || '';
      const node = $(`[data-error-for="${key}"]`);
      if (node) {
        node.textContent = message;
        node.classList.toggle('is-visible', Boolean(message));
      }
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
    });
  }

  function validate() {
    const form = readForm();
    const errors = {};

    if (form.address.length < 5) {
      errors.address = 'Укажите адрес: город, улицу и дом.';
    }
    if (!form.date) {
      errors.date = 'Выберите дату начала работ.';
    } else if (form.date < isoToday()) {
      errors.date = 'Дата не может быть раньше сегодняшней.';
    }
    if (!form.time) {
      errors.time = 'Укажите желаемое время начала.';
    }
    if (!form.hours || form.hours < 1 || form.hours > 24) {
      errors.hours = 'Продолжительность — от 1 до 24 часов.';
    }

    setErrors(errors);
    return { ok: Object.keys(errors).length === 0, form };
  }

  function focusFirstError() {
    const first = $('[aria-invalid="true"]');
    if (!first) return;
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    first.focus({ preventScroll: true });
    toast('Заполните отмеченные поля');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      area.remove();
      return ok;
    }
  }

  function sendToTelegram() {
    const { ok, form } = validate();
    if (!ok) {
      focusFirstError();
      return;
    }
    if (!state.tgUsername) {
      toast('Сначала укажите Telegram в панели владельца');
      return;
    }

    const text = buildRequestText(form);
    const url = `https://t.me/${encodeURIComponent(state.tgUsername)}?text=${encodeURIComponent(text)}`;

    pendingRequest = text;
    els.tgDialogText.textContent = text;
    els.tgDialogUser.textContent = `@${state.tgUsername}`;
    els.tgOpen.href = url;
    els.tgShare.href = url;
    els.tgDialog.showModal();
    els.tgDialog.focus();
  }

  async function copyPendingRequest() {
    const copied = await copyText(pendingRequest);
    toast(copied ? 'Заявка скопирована' : 'Не удалось скопировать — выделите текст вручную');
  }

  function syncHoursBounds() {
    const equipment = selectedEquipment();

    if (!equipment) {
      els.hours.min = '1';
      els.hoursHint.textContent = 'Выберите технику — подставим минимальную смену';
      return;
    }

    els.hours.min = String(equipment.minHours);
    els.hoursHint.textContent = `Минимальная смена — ${equipment.minHours} ч`;
    if (Number(els.hours.value) < equipment.minHours) {
      els.hours.value = String(equipment.minHours);
    }
  }

  function syncClient() {
    syncHoursBounds();
    renderZoneOptions();
    renderCatalog();
    renderEstimate();
  }

  function renderZoneOptions() {
    const equipment = selectedEquipment();

    if (!equipment) {
      els.zone.disabled = true;
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Сначала выберите технику';
      els.zone.replaceChildren(option);
      return;
    }

    const zone = selectedZone();
    selectedZoneId = zone.id;
    els.zone.disabled = false;
    els.zone.replaceChildren(...equipment.zones.map(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.name} — ${money(item.price)}`;
      return option;
    }));
    els.zone.value = zone.id;
  }

  /* ---------- Owner panel ---------- */

  function renderOwner() {
    els.tgUsername.value = state.tgUsername ? `@${state.tgUsername}` : '';
    els.ownerPinInput.value = state.ownerPin;

    els.ownerMachines.innerHTML = state.equipment
      .map(item => {
        const statusButtons = STATUS_ORDER.map(key => `
          <button class="status-option${item.status === key ? ' is-active' : ''}" type="button"
            data-status="${key}" data-id="${item.id}" aria-pressed="${item.status === key}">
            <i></i>${STATUS[key].label}
          </button>
        `).join('');

        const zoneFields = item.zones.map((zone, index) => `
          <div class="zone-card">
            <h3>Зона ${index + 1}</h3>
            <label class="field">
              <span>Название</span>
              <input type="text" maxlength="40" value="${escapeHtml(zone.name)}"
                data-id="${item.id}" data-zone-id="${zone.id}" data-zone-field="name" autocomplete="off">
            </label>
            <label class="field">
              <span>Стоимость, ₽</span>
              <input type="number" min="0" max="1000000" step="100" value="${zone.price}"
                data-id="${item.id}" data-zone-id="${zone.id}" data-zone-field="price" inputmode="numeric">
            </label>
          </div>
        `).join('');

        return `
          <article class="owner-card">
            <div class="owner-card-head">
              <img src="${item.img}" alt="">
              <div>
                <h3>${item.name}</h3>
                <p>Ставка, смена и зоны доставки для этой машины.</p>
              </div>
            </div>
            <div class="owner-grid">
              <label class="field">
                <span>Ставка, ₽/час</span>
                <input type="number" min="0" max="1000000" step="100" value="${item.rate}"
                  data-id="${item.id}" data-field="rate" inputmode="numeric">
              </label>
              <label class="field">
                <span>Мин. смена, ч</span>
                <input type="number" min="1" max="24" step="1" value="${item.minHours}"
                  data-id="${item.id}" data-field="minHours" inputmode="numeric">
              </label>
            </div>
            <div class="status-control" role="group" aria-label="Статус: ${item.name}">
              ${statusButtons}
            </div>
            <div class="zone-block">
              <p class="zone-block-title">Зоны доставки</p>
              <div class="zone-grid">${zoneFields}</div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  const OWNER_LIMITS = {
    rate: [0, 1000000],
    minHours: [1, 24]
  };

  function onOwnerInputChange(event) {
    const input = event.target.closest('input[data-field], input[data-zone-field]');
    if (!input) return;

    const equipment = equipmentById(input.dataset.id);
    if (!equipment) return;

    if (input.dataset.zoneField) {
      const zone = equipment.zones.find(item => item.id === input.dataset.zoneId);
      if (!zone) return;

      if (input.dataset.zoneField === 'name') {
        const name = input.value.trim().slice(0, 40);
        if (!name) {
          input.value = zone.name;
          toast('Название зоны не может быть пустым');
          return;
        }
        zone.name = name;
        input.value = name;
      } else {
        const price = Math.round(numberInRange(input.value, zone.price, 0, 1000000));
        zone.price = price;
        input.value = String(price);
      }

      saveState();
      syncClient();
      toast('Зона доставки сохранена');
      return;
    }

    const field = input.dataset.field;
    if (!OWNER_LIMITS[field]) return;

    const [min, max] = OWNER_LIMITS[field];
    const value = Math.round(numberInRange(input.value, equipment[field], min, max));

    equipment[field] = value;
    input.value = String(value);

    saveState();
    syncClient();
    toast('Сохранено');
  }

  function onOwnerStatusClick(event) {
    const button = event.target.closest('[data-status]');
    if (!button) return;

    const equipment = equipmentById(button.dataset.id);
    const status = button.dataset.status;
    if (!equipment || !STATUS[status] || equipment.status === status) return;

    equipment.status = status;
    saveState();
    renderOwner();
    syncClient();
    toast(`Статус: ${STATUS[status].label}`);
  }

  function normalizeUsername(raw) {
    return raw
      .trim()
      .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, '')
      .replace(/^@/, '')
      .split(/[/?#]/)[0]
      .replace(/[^a-zA-Z0-9_]/g, '');
  }

  function onUsernameChange() {
    const value = normalizeUsername(els.tgUsername.value);
    state.tgUsername = value;
    els.tgUsername.value = value ? `@${value}` : '';
    saveState();
    renderEstimate();
    toast(value ? 'Telegram сохранён' : 'Telegram очищен');
  }

  function onPinChange() {
    const value = els.ownerPinInput.value.trim();
    if (!/^\d{4,12}$/.test(value)) {
      els.ownerPinInput.value = state.ownerPin;
      toast('Код — от 4 до 12 цифр');
      return;
    }
    if (value === state.ownerPin) return;

    state.ownerPin = value;
    saveState();
    toast('Код доступа сохранён');
  }

  /* ---------- Publishing ---------- */

  function renderPublish() {
    if (!els.publishState) return;
    els.publishState.hidden = !hasDraft;
  }

  function exportSettings() {
    const blob = new Blob([`${JSON.stringify(publishedPayload(), null, 2)}\n`], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'data.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('data.json скачан — замените файл на хостинге');
  }

  async function verifyPublished() {
    if (location.protocol === 'file:') {
      toast('Проверка работает только на опубликованном сайте');
      return;
    }

    els.verifyBtn.disabled = true;
    const remote = await fetchRemoteState();
    els.verifyBtn.disabled = false;

    if (!remote) {
      toast('Не удалось прочитать data.json с сайта');
      return;
    }

    if (editableSettings(remote) === editableSettings(state)) {
      clearDraft();
      els.publishHint.textContent = 'Данные на сайте совпадают с настройками панели.';
      toast('Изменения уже на сайте');
    } else {
      els.publishHint.textContent = 'Сайт отдаёт другой data.json — замените файл в корне сайта.';
      toast('На сайте другая версия — замените data.json');
    }
  }

  async function refreshFromSite() {
    if (hasDraft || document.hidden) return;
    const remote = await fetchRemoteState();
    if (!remote) return;
    if (editableSettings(remote) === editableSettings(state)) return;

    state = remote;
    ensureSelection();
    renderOwner();
    syncClient();
    if (currentView === 'client') toast('Цены и условия обновлены');
  }

  /* ---------- Routing ---------- */

  function isOwnerUnlocked() {
    try {
      return sessionStorage.getItem(UNLOCK_KEY) === '1';
    } catch {
      return false;
    }
  }

  function setUnlocked(value) {
    try {
      if (value) sessionStorage.setItem(UNLOCK_KEY, '1');
      else sessionStorage.removeItem(UNLOCK_KEY);
    } catch {
      /* sessionStorage may be unavailable in private mode */
    }
  }

  function applyRoute() {
    const isOwner = window.location.hash === '#owner';
    const unlocked = isOwner && isOwnerUnlocked();

    els.clientView.hidden = isOwner;
    els.ownerLogin.hidden = !isOwner || unlocked;
    els.ownerView.hidden = !unlocked;
    els.backLink.hidden = !isOwner;

    document.title = unlocked
      ? 'Панель владельца — Аренда спецтехники'
      : isOwner
        ? 'Вход в панель владельца — Аренда спецтехники'
        : 'Аренда спецтехники — заявка в Telegram';

    const view = unlocked ? 'owner' : isOwner ? 'login' : 'client';
    if (currentView !== null && currentView !== view) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    currentView = view;
  }

  function handleLogin(event) {
    event.preventDefault();
    const value = els.ownerPin.value.trim();

    if (value === state.ownerPin) {
      setUnlocked(true);
      els.ownerPin.value = '';
      els.ownerPin.setAttribute('aria-invalid', 'false');
      els.loginError.textContent = '';
      els.loginError.classList.remove('is-visible');
      renderOwner();
      applyRoute();
      toast('Доступ открыт');
      return;
    }

    els.loginError.textContent = 'Неверный код доступа. Попробуйте ещё раз.';
    els.loginError.classList.add('is-visible');
    els.ownerPin.setAttribute('aria-invalid', 'true');
    els.ownerPin.select();
  }

  function lockOwner() {
    setUnlocked(false);
    els.ownerPin.value = '';
    els.loginError.textContent = '';
    els.loginError.classList.remove('is-visible');
    applyRoute();
    toast('Панель заблокирована');
  }

  /* ---------- Init ---------- */

  async function loadInitialState() {
    const draft = loadDraft();
    const remote = await fetchRemoteState();

    if (draft) {
      if (remote && editableSettings(remote) === editableSettings(draft)) {
        clearDraft();
        return remote;
      }
      hasDraft = true;
      return draft;
    }

    return remote || clone(DEFAULT_STATE);
  }

  async function init() {
    els.date.min = isoToday();
    els.date.value = isoTomorrow();
    els.time.value = '09:00';
    els.year.textContent = String(new Date().getFullYear());

    state = await loadInitialState();
    ensureSelection();

    renderOwner();
    syncClient();
    renderPublish();
    applyRoute();

    els.grid.addEventListener('click', event => {
      const button = event.target.closest('[data-select]');
      if (button) selectMachine(button.dataset.select, true);
    });

    [els.address, els.date, els.time, els.hours, els.comment].forEach(input => {
      input.addEventListener('input', () => {
        const key = input.id;
        if (key in FIELD_SELECTORS) {
          const node = $(`[data-error-for="${key}"]`);
          if (node && node.classList.contains('is-visible')) {
            node.textContent = '';
            node.classList.remove('is-visible');
            input.setAttribute('aria-invalid', 'false');
          }
        }
        renderEstimate();
      });
    });

    els.tgBtn.addEventListener('click', sendToTelegram);
    els.tgCopy.addEventListener('click', copyPendingRequest);
    els.tgClose.addEventListener('click', () => els.tgDialog.close());
    els.tgOpen.addEventListener('click', () => els.tgDialog.close());
    els.tgDialog.addEventListener('click', event => {
      if (event.target === els.tgDialog) els.tgDialog.close();
    });
    els.tgShare.addEventListener('click', event => {
      if (!navigator.share) return;
      event.preventDefault();
      navigator.share({ title: 'Заявка на аренду спецтехники', text: pendingRequest }).catch(() => {});
    });

    els.zone.addEventListener('change', () => {
      selectedZoneId = els.zone.value;
      renderEstimate();
    });

    els.ownerMachines.addEventListener('change', onOwnerInputChange);
    els.ownerMachines.addEventListener('click', onOwnerStatusClick);
    els.tgUsername.addEventListener('change', onUsernameChange);
    els.ownerPinInput.addEventListener('change', onPinChange);

    els.loginForm.addEventListener('submit', handleLogin);
    els.ownerPin.addEventListener('input', () => {
      if (!els.loginError.classList.contains('is-visible')) return;
      els.loginError.textContent = '';
      els.loginError.classList.remove('is-visible');
      els.ownerPin.setAttribute('aria-invalid', 'false');
    });
    els.lockBtn.addEventListener('click', lockOwner);

    els.exportBtn.addEventListener('click', exportSettings);
    els.verifyBtn.addEventListener('click', verifyPublished);

    window.addEventListener('hashchange', applyRoute);
    document.addEventListener('visibilitychange', refreshFromSite);
    setInterval(refreshFromSite, 60000);
  }

  init();
})();
