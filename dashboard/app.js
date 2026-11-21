(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const data = window.RADAR;
  if (!data) {
    byId('board').setAttribute('aria-busy', 'false');
    byId('data-message').textContent = 'Snapshot data is missing. Open the dashboard from the generated output.';
    return;
  }

  const pageSize = 15;
  const sortKeys = ['implied_value_usd', 'tvl_usd', 'change_7d'];
  const filters = {
    q: byId('search'),
    category: byId('category'),
    chain: byId('chain'),
    sort: byId('sort'),
  };
  const groups = new Map(data.rows.map((row) => [row.slug, row]));
  const dialog = byId('detail');
  const checkedSteps = new Map();
  let selected = null;
  let page = 0;

  const compactUsd = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2,
  });
  const wholeUsd = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  });
  const ratio = new Intl.NumberFormat('en-US', { maximumFractionDigits: 5, minimumFractionDigits: 2 });
  const factor = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4, minimumFractionDigits: 2 });
  const pct = new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero', maximumFractionDigits: 2, minimumFractionDigits: 1 });
  const usd = (value) => value === null ? '—' : compactUsd.format(value);
  const multiple = (value) => value === null ? '—' : `${ratio.format(value)}×`;
  const multiplier = (value) => `${factor.format(value)}×`;
  const change = (value) => value === null ? '—' : `${pct.format(value)}%`;
  const categoryOf = (row) => row.category ?? 'Uncategorized';

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function setFacts(id, pairs) {
    byId(id).replaceChildren(...pairs.map(([label, value]) => {
      const item = document.createElement('div');
      item.append(element('dt', label), element('dd', value));
      return item;
    }));
  }

  function fillFilter(select, values) {
    for (const value of [...new Set(values)].sort((a, b) => a.localeCompare(b))) {
      const option = element('option', value);
      option.value = value;
      select.append(option);
    }
  }

  function updateLink() {
    const params = new URLSearchParams();
    for (const [key, input] of Object.entries(filters)) {
      if (input.value && (key !== 'sort' || input.value !== sortKeys[0])) params.set(key, input.value);
    }
    if (selected) params.set('p', selected);
    const hash = params.toString();
    history.replaceState(null, '', location.pathname + location.search + (hash ? `#${hash}` : ''));
  }

  function restoreFilters(params) {
    for (const [key, input] of Object.entries(filters)) {
      const value = params.get(key);
      if (value === null) continue;
      if (input.tagName === 'INPUT' || [...input.options].some((option) => option.value === value)) {
        input.value = value;
      }
    }
  }

  function matches(row, query, category, chain) {
    if (category && categoryOf(row) !== category) return false;
    if (chain && !row.chains.includes(chain)) return false;
    const searchText = [row.name, row.slug, categoryOf(row), ...row.chains].join(' ').toLowerCase();
    return searchText.includes(query);
  }

  function makeSorter(key) {
    return (a, b) => {
      if (a[key] === null && b[key] !== null) return 1;
      if (b[key] === null && a[key] !== null) return -1;
      return b[key] - a[key] || a.rank - b.rank;
    };
  }

  function chainCell(chains) {
    const cell = element('td', chains.slice(0, 2).join(' · ') || '—', 'chains');
    if (chains.length > 2) {
      cell.append(' ', element('span', `+${chains.length - 2}`, 'chain-more'));
      cell.title = chains.join(', ');
    }
    return cell;
  }

  function changeCell(value) {
    const cell = element('td', change(value), 'numeric');
    if (value > 0) cell.classList.add('positive');
    if (value < 0) cell.classList.add('negative');
    return cell;
  }

  function moneyCell(value, className = 'numeric') {
    const cell = element('td', usd(value), className);
    if (value !== null) cell.title = wholeUsd.format(value);
    return cell;
  }

  function boardRow(row) {
    const tr = element('tr');
    const button = element('button', row.name, 'protocol');
    button.type = 'button';
    button.addEventListener('click', () => openDetail(row));
    tr.addEventListener('click', (event) => { if (event.target !== button) button.click(); });
    const name = element('th');
    name.scope = 'row';
    name.append(button);
    tr.append(
      element('td', String(row.rank), 'rank numeric'),
      name,
      element('td', categoryOf(row), 'category'),
      chainCell(row.chains),
      moneyCell(row.tvl_usd),
      changeCell(row.change_7d),
      moneyCell(row.implied_value_usd, 'numeric estimate'),
      element('td', row.tvl_usd > 0 ? multiple(row.implied_value_usd / row.tvl_usd) : '—', 'numeric'),
    );
    return tr;
  }

  function renderBoard() {
    const query = filters.q.value.trim().toLowerCase();
    const key = filters.sort.value;
    const rows = data.rows
      .filter((row) => matches(row, query, filters.category.value, filters.chain.value))
      .sort(makeSorter(key));
    const start = page * pageSize;
    const end = Math.min(start + pageSize, rows.length);

    byId('rows').replaceChildren(...rows.slice(start, end).map(boardRow));
    byId('table-scroll').scrollTop = 0;
    byId('empty').hidden = rows.length > 0;
    byId('result-count').textContent = rows.length ? `${start + 1}–${end} of ${rows.length}` : '0 matches';
    byId('previous').disabled = page === 0;
    byId('next').disabled = end >= rows.length;
    for (const sortKey of sortKeys) {
      if (sortKey === key) byId(sortKey).setAttribute('aria-sort', 'descending');
      else byId(sortKey).removeAttribute('aria-sort');
    }
  }

  function setPage(nextPage) {
    page = nextPage;
    renderBoard();
  }

  function renderMethod() {
    const m = data.model;
    setFacts('metrics', [
      ['Ranked protocols', String(data.board_size)],
      ['Watchlist covered', `${data.watchlist_size} / ${data.watchlist_size}`],
      ['Global peer median', multiple(data.global_peers.median)],
    ]);
    byId('method-body').append(
      element('p', `We compare market cap divided by TVL across ${data.global_peers.count} snapshot protocols with both figures. With at least ${m.min_category_peers} peers, the category median sets the starting multiple. Smaller groups blend toward the global median (${multiple(data.global_peers.median)}) using ${100 / m.min_category_peers}% category weight per peer. The blend uses log(1 + multiple) to soften extreme small-group ratios. With zero peers, the global median supplies the starting multiple.`),
      element('p', `We apply ${100 * m.growth_weight}% of the seven-day TVL change, bounded to a ${multiplier(m.growth_floor)}–${multiplier(m.growth_cap)} multiplier. Listing age adjusts the value by ${change((m.new_multiplier - 1) * 100)} under ${m.new_age_days} days or ${change((m.old_multiplier - 1) * 100)} from ${m.old_age_days.toLocaleString('en-US')} days. Each additional chain adds up to ${change(m.breadth_per_extra_chain * 100)}, with a total bonus capped at ${change(m.breadth_bonus_cap * 100)}. Missing growth or listing age is neutral. We round the result to whole dollars, with a $1 floor.`),
      element('p', `The board covers the sealed ${usd(data.floor_usd)} watchlist and ${data.early_size} eligible protocols below its floor. An implied value estimates a hypothetical market cap. The snapshot establishes what DefiLlama had on record as of ${data.as_of}.`),
    );
  }

  function setSteps(row, interactive) {
    const saved = checkedSteps.get(row.slug) ?? new Set();
    if (interactive) checkedSteps.set(row.slug, saved);
    byId('steps').replaceChildren(...row.farm_steps.map((step, index) => {
      const [, action, cost, time] = step.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/) ?? [null, step, '', ''];
      const item = element('li');
      const notes = element('span', undefined, 'step-copy');
      notes.append(element('span', action));
      if (cost) notes.append(element('span', `Cost · ${cost}`, 'step-cost'));
      if (time) notes.append(element('span', `Time · ${time}`, 'step-time'));
      if (!interactive) {
        item.append(notes);
        return item;
      }

      const label = element('label');
      const check = element('input');
      check.type = 'checkbox';
      check.checked = saved.has(index);
      check.addEventListener('change', () => {
        if (check.checked) saved.add(index);
        else saved.delete(index);
      });
      label.append(check, notes);
      item.append(label);
      return item;
    }));
  }

  function renderDetail(row, interactive) {
    const model = row.model;
    const category = categoryOf(row);
    byId('detail-meta').textContent = `Rank ${row.rank} of ${data.board_size} · ${category}`;
    byId('detail-title').textContent = row.name;
    byId('detail-chains').textContent = row.chains.join(' · ') || 'No chains recorded';
    byId('detail-value').textContent = wholeUsd.format(row.implied_value_usd);
    setFacts('breakdown', [
      ['TVL', wholeUsd.format(row.tvl_usd)],
      ['Applied peer multiple', multiple(model.peer_multiple)],
      [model.growth_pct === null ? '7d growth · unreported' : `7d growth · ${change(model.growth_pct)}`, multiplier(model.growth_multiplier)],
      [model.age_days === null ? 'Listing age · unreported' : `Listing age · ${model.age_days.toLocaleString('en-US')} days`, multiplier(model.maturity_multiplier)],
      [`Breadth · ${model.chain_count} ${model.chain_count === 1 ? 'chain' : 'chains'}`, multiplier(model.breadth_multiplier)],
      ['Implied multiple after adjustments', row.tvl_usd > 0 ? multiple(row.implied_value_usd / row.tvl_usd) : '—'],
    ]);

    const peerNotes = {
      category_median: `The ${category} median supplies the applied multiple.`,
      shrunk_category_median: `Sparse group. The applied multiple blends the ${category} median toward the global median with ${Math.round(model.category_weight * 100)}% category weight.`,
      global_median: `The global median applies because ${category} has zero peers with both figures.`,
    };
    byId('peer-note').textContent = peerNotes[model.peer_source];
    setFacts('peers', [
      [`${category} · token-bearing peers`, String(model.peer_count)],
      ['Category median mcap/TVL', multiple(model.category_median_multiple)],
      [`Global median · ${data.global_peers.count} peers`, multiple(model.global_median_multiple)],
    ]);

    byId('raw').open = false;
    setFacts('facts', [
      ['Slug', row.slug], ['Name', row.name], ['Category', row.category ?? '—'],
      ['Chains', row.chains.join(', ') || '—'], ['TVL', wholeUsd.format(row.tvl_usd)],
      ['7d TVL change', row.change_7d === null ? '—' : `${row.change_7d}%`],
      ['Market cap', row.mcap_usd === null ? '—' : wholeUsd.format(row.mcap_usd)],
      ['Listed at', row.listed_at ?? '—'], ['CoinGecko ID', row.gecko_id ?? '—'], ['Symbol', row.symbol ?? '—'],
    ]);
    setSteps(row, interactive);
  }

  function openDetail(row) {
    selected = row.slug;
    updateLink();
    renderDetail(row, true);
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }

  function renderDetailPage(row) {
    renderDetail(row, false);
    document.title = `${row.name} | Token Radar`;

    const pageSection = element('section', undefined, 'detail-page');
    pageSection.setAttribute('aria-labelledby', 'detail-title');
    const head = dialog.querySelector('.detail-head');
    const dialogTitle = byId('detail-title');
    const title = element('h1', dialogTitle.textContent);
    title.id = dialogTitle.id;
    dialogTitle.replaceWith(title);
    const back = element('a', 'Back to the board', 'detail-back');
    back.href = 'index.html';
    head.querySelector('form').replaceWith(back);

    const grid = dialog.querySelector('.detail-grid');
    const raw = byId('raw');
    const facts = element('section', undefined, 'detail-raw');
    facts.append(element('h3', raw.querySelector('summary').textContent), byId('facts'));
    raw.remove();
    grid.append(facts);

    pageSection.append(head, grid);
    const shell = document.querySelector('.shell');
    shell.replaceChildren(shell.querySelector('.masthead'), pageSection);
    document.querySelector('.skip').remove();
    dialog.remove();
  }

  function renderMarket() {
    if (!data.live.length) return;
    byId('market').hidden = false;
    byId('market-title').textContent = `Listed token reference · ${data.live.length} protocols`;
    byId('market-rows').replaceChildren(...data.live.map((row) => {
      const tr = element('tr');
      tr.append(
        element('td', row.name), element('td', categoryOf(row)), chainCell(row.chains),
        moneyCell(row.tvl_usd), changeCell(row.change_7d), moneyCell(row.mcap_usd),
      );
      return tr;
    }));
  }

  byId('snapshot').textContent = `DefiLlama snapshot · ${data.as_of}`;
  byId('snapshot').title = data.source;

  const query = new URLSearchParams(location.search);
  if (query.get('shot') === 'detail') {
    const row = groups.get(query.get('slug')) ?? data.rows.find((row) => row.rank === 1);
    if (row) {
      renderDetailPage(row);
      return;
    }
  }

  fillFilter(filters.category, data.rows.map(categoryOf));
  fillFilter(filters.chain, data.rows.flatMap((row) => row.chains));
  const params = new URLSearchParams(location.hash.slice(1));
  restoreFilters(params);
  renderMethod();
  renderBoard();
  renderMarket();
  byId('data-message').hidden = true;
  byId('board').setAttribute('aria-busy', 'false');

  for (const [key, input] of Object.entries(filters)) {
    input.addEventListener(key === 'q' ? 'input' : 'change', () => {
      setPage(0);
      updateLink();
    });
  }
  byId('previous').addEventListener('click', () => setPage(page - 1));
  byId('next').addEventListener('click', () => setPage(page + 1));
  byId('clear').addEventListener('click', () => {
    filters.q.value = '';
    filters.category.value = '';
    filters.chain.value = '';
    setPage(0);
    updateLink();
    filters.q.focus();
  });
  dialog.addEventListener('close', () => {
    selected = null;
    updateLink();
  });
  const linkedRow = groups.get(params.get('p'));
  if (linkedRow) openDetail(linkedRow);
})();
