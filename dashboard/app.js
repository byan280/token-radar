// Token Radar's dashboard, rewritten: it reads the dataset main.ts writes beside
// dashboard/ and renders the ranked board, the filters, the per-protocol detail
// drawer and the model's own arithmetic. No network: every byte shown is in data.js.
(() => {
  "use strict";

  var dataset = window.RADAR;
  if (!dataset) return;
  var board = document.getElementById('board');
  var view = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usdFormat = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function formatUsd(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'n/a';
    var magnitude = Math.abs(value);
    if (magnitude >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B';
    if (magnitude >= 1e6) return '$' + (value / 1e6).toFixed(1) + 'M';
    if (magnitude >= 1e3) return '$' + Math.round(value / 1e3) + 'K';
    return usdFormat.format(value);
  }
  function formatPct(value) {
    if (value === null || value === undefined || !isFinite(value)) return 'n/a';
    var sign = value > 0 ? '+' : '';
    return sign + value.toFixed(2) + '%';
  }
  function formatAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    var whole = Math.max(0, Math.round(days));
    return whole + 'd';
  }
  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  // The multiple is the row's own calibrated comparable multiple, not one shared constant.
  function recomputeImplied(row, model) {
    var change = row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d;
    var clamped = Math.min(model.growth_cap, Math.max(model.growth_floor, change));
    var growthFactor = 1 + (clamped / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var bounded = Math.min(Math.max(age, 0), model.maturity_days);
    var maturityFactor = model.maturity_floor + (bounded / model.maturity_days) * model.maturity_range;
    var scored = row.tvl_usd * row.multiple * growthFactor * maturityFactor;
    return Math.max(1, Math.round(scored));
  }

  function h(tag, attrs) {
    var node = document.createElement(tag);
    var keys = attrs ? Object.keys(attrs) : [];
    keys.forEach(function (key) {
      var val = attrs[key];
      if (key === 'class') { node.className = val; return; }
      if (key === 'text') { node.textContent = val; return; }
      if (key === 'html') { node.innerHTML = val; return; }
      if (key.indexOf('on') === 0) { node.addEventListener(key.slice(2), val); return; }
      if (val !== null && val !== undefined) node.setAttribute(key, val);
    });
    var kids = Array.prototype.slice.call(arguments, 2);
    kids.forEach(function (kid) {
      if (kid === null || kid === undefined) return;
      if (Array.isArray(kid)) {
        kid.forEach(function (c) { if (c) node.appendChild(c); });
        return;
      }
      if (typeof kid === 'string') node.appendChild(document.createTextNode(kid));
      else node.appendChild(kid);
    });
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and age
  // decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function firstChain(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalAmount(p) {
    var tvl = p.tvl_usd;
    if (tvl >= 5e9) return 250;
    if (tvl >= 1e9) return 150;
    if (tvl >= 1e8) return 100;
    return 50;
  }
  function holdLength(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function planAction(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.includes('basis')) {
      return `Open a delta-neutral basis position through ${name} on ${chain}: hold spot on one side and short the perpetual on the other, and collect the funding spread. Start with $${capital} split evenly between the two legs.`;
    }
    if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
      return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
    }
    if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
      return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
    }
    if (c.includes('bridge') || c.includes('cross chain')) {
      return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
    }
    if (c.includes('staking') || c.includes('restak')) {
      return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
    }
    if (c.includes('perpetual') || c.includes('derivative')) {
      return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
    }
    if (c.includes('prediction')) {
      return `Fund $${capital} and place one market position on ${name}.`;
    }
    if (c.includes('governance')) {
      return `Deposit $${capital} into ${name}'s governance vault on ${chain}, delegate the votes, and vote on one live proposal.`;
    }
    if (c === 'chain' || c.includes('layer 1') || c.includes('layer1')) {
      return `Move $${capital} of USDC onto the ${name} network through its official bridge, then use one of its own apps each week and keep the position open.`;
    }
    if (c.includes('curator') || c.includes('allocator')) {
      return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
    }
    if (c.includes('stable')) {
      return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
    }
    if (c.includes('rwa')) {
      return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
    }
    if (c.includes('cedefi') || c.includes('cefi')) {
      return `Deposit $${capital} of USDC into ${name} on ${chain}, and check its published proof of reserves before each new deposit.`;
    }
    if (c.includes('insurance')) {
      return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
    }
    if (c.includes('payment')) {
      return `Route $${capital} of payments through ${name} on ${chain} and keep one recurring payment active.`;
    }
    return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
  }
  function formatStep(step) {
    var joined = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (joined.length > 600) joined = joined.slice(0, 596) + '...';
    if (joined.length < 20) joined = joined + " Hold the position and check the protocol's own page.";
    return joined;
  }
  function buildPlan(p) {
    var chain = firstChain(p);
    var capital = capitalAmount(p);
    var hold = holdLength(p.age_days);
    var steps = [
      {
        text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.',
        cost: 'under $3 of gas for the first transaction',
        time: '5 minutes',
      },
      {
        text: planAction(p, capital, chain),
        cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
        time: '15 minutes to set up',
      },
      {
        text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.',
        cost: 'about $2 of gas a week',
        time: '10 minutes a week',
      },
      {
        text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
        cost: `the $${capital} stays in the position`,
        time: `${hold} days`,
      },
      {
        text: 'Set a loss limit before you start: decide the most you are willing to lose, write it in your farm log, and never add funds after a drop to chase it.',
        cost: 'nothing but discipline',
        time: '5 minutes',
      },
      {
        text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.",
        cost: 'no fee to check, and never pay to claim',
        time: '10 minutes',
      },
      {
        text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.',
        cost: 'nothing but the log',
        time: '5 minutes',
      },
    ];
    return steps.map(formatStep);
  }

  function parseHash() {
    var raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    var params = new URLSearchParams(raw);
    var q = params.get('q');
    if (q) view.q = q;
    var picked = params.get('p');
    if (picked) view.selected = picked;
    var cat = params.get('category');
    if (cat) view.category = cat;
    var ch = params.get('chain');
    if (ch) view.chain = ch;
  }
  function saveHash() {
    var params = new URLSearchParams();
    if (view.q) params.set('q', view.q);
    if (view.category !== 'all') params.set('category', view.category);
    if (view.chain !== 'all') params.set('chain', view.chain);
    if (view.selected) params.set('p', view.selected);
    var next = params.toString();
    var target = next ? '#' + next : window.location.pathname + window.location.search;
    window.history.replaceState(null, '', target);
  }

  function visibleRows() {
    var needle = view.q.trim().toLowerCase();
    return dataset.rows.filter(function (row) {
      if (view.category !== 'all' && row.category !== view.category) return false;
      if (view.chain !== 'all' && (!row.chains || row.chains.indexOf(view.chain) < 0)) return false;
      if (!needle) return true;
      var haystack = [row.name, row.slug, row.category, (row.chains || []).join(' ')].join(' ').toLowerCase();
      return haystack.indexOf(needle) >= 0;
    });
  }
  function sortVisible(list) {
    var key = view.sort;
    function keyOf(row) {
      if (key === 'name') return row.name.toLowerCase();
      if (key === 'tvl') return row.tvl_usd;
      if (key === 'growth') return row.change_7d === null ? -Infinity : row.change_7d;
      if (key === 'age') return row.age_days === null ? Infinity : row.age_days;
      return row.implied_value_usd;
    }
    return list.slice().sort(function (a, b) {
      var av = keyOf(a);
      var bv = keyOf(b);
      if (av < bv) return -view.dir;
      if (av > bv) return view.dir;
      if (a.slug < b.slug) return -1;
      if (a.slug > b.slug) return 1;
      return 0;
    });
  }

  function pageHeader() {
    return h('header', { class: 'top' },
      h('div', { class: 'brand' }, h('span', { class: 'mark' }), h('span', { class: 'brand-name', text: 'Token Radar' })),
      h('div', { class: 'top-meta' },
        h('span', { text: 'Snapshot ' + dataset.as_of }),
        h('span', { text: 'DefiLlama protocol index' }),
        h('span', { text: dataset.model_version + ' model' })
      )
    );
  }

  function introBlock() {
    return h('section', { class: 'lede' },
      h('div', null,
        h('h1', { text: dataset.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        h('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(dataset.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + dataset.early_size + ' pre-token protocols below that floor. Implied value is a model, not a promise.' })
      ),
      h('div', { class: 'facts' },
        h('div', { class: 'fact' }, h('span', { text: 'Watchlist covered' }), h('b', { text: dataset.watchlist_size + ' / ' + dataset.watchlist_size })),
        h('div', { class: 'fact' }, h('span', { text: 'Pre-token rows scored' }), h('b', { text: String(dataset.board_size) })),
        h('div', { class: 'fact' }, h('span', { text: 'Early rows below the floor' }), h('b', { text: String(dataset.early_size) })),
        h('div', { class: 'fact' }, h('span', { text: 'Live-token protocols set aside' }), h('b', { text: String(dataset.live_size) }))
      )
    );
  }

  function filterControls() {
    var categories = Array.from(new Set(dataset.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = h('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: view.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { view.q = search.value; saveHash(); paint(); });
    var select = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return h('option', { value: c, text: c, selected: c === view.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { view.category = select.value; saveHash(); paint(); });
    var chains = Array.from(new Set(dataset.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var chainSelect = h('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      h('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return h('option', { value: c, text: c, selected: c === view.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { view.chain = chainSelect.value; saveHash(); paint(); });
    var pre = h('button', { type: 'button', 'aria-pressed': view.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { view.tab = 'pre-token'; paint(); } });
    var live = h('button', { type: 'button', 'aria-pressed': view.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { view.tab = 'live'; paint(); } });
    return h('div', { class: 'controls' },
      h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'category', text: 'Category' }), select),
      h('div', { class: 'field' }, h('label', { for: 'chain', text: 'Chain' }), chainSelect),
      h('div', { class: 'field' }, h('span', { class: 'sub', text: 'Token status' }), h('div', { class: 'tabs' }, pre, live)),
      h('span', { class: 'count', text: view.tab === 'pre-token' ? visibleRows().length + ' rows shown' : dataset.live.length + ' live-token protocols' })
    );
  }

  function sortHead(key, label) {
    return h('th', { scope: 'col' },
      h('button', { type: 'button', onclick: function () { if (view.sort === key) view.dir = -view.dir; else { view.sort = key; view.dir = -1; } paint(); } },
        label,
        view.sort === key ? h('span', { 'aria-hidden': 'true', text: view.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function preTokenTable() {
    var list = sortVisible(visibleRows());
    if (list.length === 0) {
      return h('div', { class: 'panel' }, h('div', { class: 'empty' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search or pick another category to see the board again.' }),
        h('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { view.q = ''; view.category = 'all'; view.chain = 'all'; saveHash(); paint(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = h('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : formatPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var chainLabel = (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain');
      var width = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      var tr = h('tr', {
        'data-selected': view.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { showDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showDetail(r.slug); } }
      },
        h('td', { class: 'num', text: String(r.rank) }),
        h('td', null, h('div', { class: 'name' },
          h('b', { text: r.name }),
          h('span', { class: 'sub', text: chainLabel })
        )),
        h('td', { class: 'num', text: formatUsd(r.tvl_usd) }),
        h('td', { class: 'num ' + growthClass, text: growth }),
        h('td', { class: 'num', text: formatAge(r.age_days) }),
        h('td', null, h('div', { class: 'implied' },
          h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: 'width:' + width + '%' })),
          h('span', { class: 'num', text: formatUsd(r.implied_value_usd) })
        )),
        h('td', null, h('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          h('thead', null, h('tr', null,
            sortHead('implied', 'Rank'),
            sortHead('name', 'Protocol'),
            sortHead('tvl', 'TVL'),
            sortHead('growth', '7d'),
            sortHead('age', 'Age'),
            sortHead('implied', 'Implied value'),
            h('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTokenTable() {
    var tbody = h('tbody');
    dataset.live.forEach(function (r) {
      var trend = r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg';
      var chainLabel = (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain');
      tbody.appendChild(h('tr', null,
        h('td', { class: 'num', text: 'live' }),
        h('td', null, h('div', { class: 'name' }, h('b', { text: r.name }), h('span', { class: 'sub', text: chainLabel }))),
        h('td', { class: 'num', text: formatUsd(r.tvl_usd) }),
        h('td', { class: 'num ' + trend, text: formatPct(r.change_7d) }),
        h('td', { class: 'num', text: formatUsd(r.mcap_usd) }),
        h('td', null, h('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Protocol' }), h('th', { scope: 'col', text: 'TVL' }), h('th', { scope: 'col', text: '7d' }), h('th', { scope: 'col', text: 'Market cap' }), h('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelExplainer() {
    var m = dataset.model;
    var cal = dataset.calibration || { tvl_slope: 0, global_intercept: 0, category_intercepts: {}, fit_resid_std: 0, fit_r2: 0, live_count: 0, category_count: 0 };
    var formula = 'implied = round( tvl_usd x multiple x (1 + clamp(change_7d, '
      + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight
      + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days
      + ' x ' + m.maturity_range + ') )';
    var fitFormula = 'multiple = clamp( exp( intercept + ' + cal.tvl_slope + ' x ln(tvl_usd) ), '
      + m.multiple_floor + '..' + m.multiple_cap + ' )';
    var refLines = [];
    Object.keys(cal.category_intercepts || {}).sort().forEach(function (c) {
      var mult = Math.exp(cal.category_intercepts[c] + cal.tvl_slope * Math.log(100000000));
      mult = Math.min(m.multiple_cap, Math.max(m.multiple_floor, mult));
      refLines.push(c + ' ' + mult.toFixed(3));
    });
    var refText = refLines.length > 0 ? ' At $100M of TVL the fitted multiples are: ' + refLines.join(', ') + '.' : '';
    var note = 'The multiple is fitted from this snapshot alone: a least-squares fit of log market-cap-to-TVL on log TVL over the '
      + cal.live_count + ' live-token protocols, one intercept per category where at least ' + m.min_category_n + ' of them trade ('
      + cal.category_count + ' categories), otherwise the shared intercept. The fitted slope is ' + cal.tvl_slope + ' (clamped to '
      + m.slope_floor + '..' + m.slope_cap + '): larger protocols trade at lower multiples, so a flat median would overstate a giant '
      + 'and understate a small protocol. The fit leaves a residual spread of ' + cal.fit_resid_std + ' log units (R-squared ' + cal.fit_r2 + ').'
      + refText + ' A row whose category has no fitted intercept uses the shared one. TVL and '
      + 'seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record '
      + 'of how long it has run with no token on record; an unlisted age uses ' + m.unknown_age_days + ' days. The early '
      + 'radar is every pre-token protocol below the watchlist floor, by TVL, and the live-token protocols are set aside with their market caps shown.';
    return h('section', { class: 'panel model' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      h('div', { class: 'formula' }, formula),
      h('div', { class: 'formula' }, fitFormula),
      h('p', { class: 'sub', text: note })
    );
  }

  var detailDialog = h('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  detailDialog.addEventListener('close', function () { view.selected = null; saveHash(); });

  function showDetail(slug) {
    var row = dataset.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    view.selected = slug;
    saveHash();
    detailDialog.textContent = '';
    var steps = buildPlan(row);
    var chainLabel = (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain');
    var recomputed = recomputeImplied(row, dataset.model);
    var matchNote = recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.';
    var checkText = 'Model ' + dataset.model_version + ': the same function scores every protocol. The page recomputes this row as '
      + formatUsd(recomputed) + matchNote + ' This is an estimate, not a price.';
    detailDialog.appendChild(h('div', { class: 'detail-head' },
      h('div', null,
        h('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + dataset.board_size }),
        h('h2', { id: 'detail-title', text: row.name }),
        h('p', { class: 'sub', text: chainLabel })
      ),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { detailDialog.close(); } })
    ));
    detailDialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Implied value' }),
      h('div', { class: 'equation' },
        h('div', null, h('span', { text: 'TVL' }), h('b', { class: 'num', text: formatUsd(row.tvl_usd) })),
        h('div', null, h('span', { text: 'Comparable multiple' }), h('b', { class: 'num', text: String(row.multiple) + (row.multiple_basis === 'category' ? ' (category fit)' : ' (global fit)') })),
        h('div', null, h('span', { text: 'Seven-day growth' }), h('b', { class: 'num', text: formatPct(row.change_7d) })),
        h('div', null, h('span', { text: 'Age with no token' }), h('b', { class: 'num', text: formatAge(row.age_days) })),
        h('div', null, h('span', { text: 'Growth multiplier' }), h('b', { class: 'num', text: String(row.growth_multiplier) })),
        h('div', null, h('span', { text: 'Maturity multiplier' }), h('b', { class: 'num', text: String(row.maturity_multiplier) })),
        h('div', null, h('span', { text: 'Implied value' }), h('b', { class: 'num', text: formatUsd(row.implied_value_usd) }))
      ),
      h('p', { class: 'sub', text: checkText })
    ));
    detailDialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Farm plan' }),
      h('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return h('li', null, h('b', { text: action }), h('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof detailDialog.showModal === 'function') {
      if (!detailDialog.open) detailDialog.showModal();
    } else {
      detailDialog.setAttribute('open', '');
    }
  }

  function pageFooter() {
    return h('footer', { class: 'foot' },
      h('p', { class: 'sub', text: 'Source: ' + dataset.source + '. "No token" here means the snapshot records no token for the protocol; it is not proof none exists. Implied values are model estimates, not prices, and no row predicts whether or when a token is issued. Farm plans are general activity guides, not financial advice: never share a seed phrase, and never pay anyone to claim.' }),
      h('p', { class: 'sub', text: 'Model ' + dataset.model_version + ' · ' + dataset.board_size + ' pre-token rows · snapshot ' + dataset.as_of })
    );
  }

  function paint() {
    board.textContent = '';
    var shell = h('div', { class: 'shell' });
    shell.appendChild(pageHeader());
    shell.appendChild(introBlock());
    shell.appendChild(filterControls());
    shell.appendChild(view.tab === 'pre-token' ? preTokenTable() : liveTokenTable());
    if (view.tab === 'pre-token') shell.appendChild(modelExplainer());
    shell.appendChild(pageFooter());
    board.appendChild(shell);
    board.setAttribute('aria-busy', 'false');
    if (!detailDialog.isConnected) board.appendChild(detailDialog);
    if (view.selected) showDetail(view.selected);
  }

  parseHash();
  paint();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && detailDialog.open) detailDialog.close();
  });
})();
