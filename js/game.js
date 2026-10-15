/* Klondike rules, layout, drag and drop, undo, hints, stats and the win animation. */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var board = $('#board');

  // ---------- storage ----------
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var lang0 = (navigator.language || '').toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
  var settings = Object.assign({ draw: 1, back: 'night', table: 'paper', auto: true, tap: true, lang: lang0 }, store.get('wcsol.settings', {}));
  var stats = Object.assign({ played: 0, won: 0, streak: 0, bestStreak: 0, bestTime: 0, bestScore: 0 }, store.get('wcsol.stats', {}));
  function saveSettings() { store.set('wcsol.settings', settings); }
  function saveStats() { store.set('wcsol.stats', stats); }

  // ---------- text ----------
  var T = {
    ru: {
      title: 'Акварельный пасьянс', subtitle: 'Косынка', time: 'время', moves: 'ходы', score: 'очки',
      newGame: 'Новая игра', undo: 'Отменить', hint: 'Подсказка', stats: 'Статистика', settings: 'Настройки', rules: 'Правила',
      loading: 'Смешиваем краски…', finish: 'Собрать карты',
      draw1: 'По одной карте', draw1note: 'Спокойная игра, выигрывается чаще', draw3: 'По три карты', draw3note: 'Классика, нужно думать наперёд',
      restart: 'Сыграть эту раздачу заново', dealNo: 'Раздача №', play: 'Играть', cancel: 'Отмена', close: 'Закрыть',
      backTitle: 'Рубашка', tableTitle: 'Стол',
      back_night: 'Ночь', back_meadow: 'Луг', back_sunset: 'Закат',
      table_paper: 'Бумага', table_sage: 'Шалфей', table_dusk: 'Сумерки',
      autoMove: 'Сами переносить в «дом» карты, которые больше не нужны на столе',
      tapMove: 'Нажатие на карту переносит её в подходящее место',
      lang: 'Язык:',
      played: 'Сыграно', won: 'Побед', winRate: 'Процент побед', bestTime: 'Лучшее время', bestScore: 'Лучший счёт',
      streak: 'Серия побед сейчас', bestStreak: 'Лучшая серия', reset: 'Сбросить статистику', resetAsk: 'Сбросить всю статистику?',
      win: 'Победа!', winText: 'Все карты разложены по мастям, от туза до короля.', timeBonus: 'Бонус за скорость', total: 'Итого',
      noMoves: 'Ходов больше нет. Отмените пару ходов или начните новую игру.', hintDraw: 'Откройте карту из колоды.',
      undoEmpty: 'Отменять пока нечего.', deal: 'раздача №',
      rulesHtml: '<p>Соберите все карты в четыре стопки «дома» справа вверху: каждую масть от туза до короля.</p>' +
        '<ul><li>В семи столбцах карты кладут по убыванию, чередуя цвета: тёплые <b style="color:#b8283f">♥ ♦</b> и холодные <b style="color:#262d55">♠ ♣</b>. На красную восьмёрку кладут тёмную семёрку.</li>' +
        '<li>Можно переносить сразу несколько открытых карт, если они уже лежат по порядку.</li>' +
        '<li>На пустое место в столбце можно положить только короля.</li>' +
        '<li>Нажмите на колоду слева вверху, чтобы открыть карты. Когда она кончится, нажмите ещё раз, и колода перевернётся.</li>' +
        '<li>Карты можно перетаскивать или просто нажимать на них: карта сама переедет в подходящее место.</li></ul>' +
        '<p><b>Очки:</b> карта в «дом» +10, из колоды в столбец +5, открыть карту в столбце +5, вернуть карту из «дома» −15, перевернуть колоду −100 (−20 при игре по три). За быструю победу даётся бонус.</p>' +
        '<p><b>Клавиши:</b> <kbd>Пробел</kbd> колода, <kbd>Z</kbd> отменить, <kbd>H</kbd> подсказка, <kbd>N</kbd> новая игра.</p>'
    },
    en: {
      title: 'Watercolor Solitaire', subtitle: 'Klondike', time: 'time', moves: 'moves', score: 'score',
      newGame: 'New game', undo: 'Undo', hint: 'Hint', stats: 'Statistics', settings: 'Settings', rules: 'How to play',
      loading: 'Mixing the paints…', finish: 'Collect the cards',
      draw1: 'Draw one', draw1note: 'Relaxed, you win more often', draw3: 'Draw three', draw3note: 'The classic, plan ahead',
      restart: 'Replay this deal', dealNo: 'Deal #', play: 'Play', cancel: 'Cancel', close: 'Close',
      backTitle: 'Card back', tableTitle: 'Table',
      back_night: 'Night', back_meadow: 'Meadow', back_sunset: 'Sunset',
      table_paper: 'Paper', table_sage: 'Sage', table_dusk: 'Dusk',
      autoMove: 'Move cards to the foundations by themselves when they are no longer needed',
      tapMove: 'Tapping a card moves it to the best place',
      lang: 'Language:',
      played: 'Played', won: 'Won', winRate: 'Win rate', bestTime: 'Best time', bestScore: 'Best score',
      streak: 'Current streak', bestStreak: 'Best streak', reset: 'Reset statistics', resetAsk: 'Reset all statistics?',
      win: 'You won!', winText: 'Every suit is built up from ace to king.', timeBonus: 'Speed bonus', total: 'Total',
      noMoves: 'No moves left. Undo a few moves or start a new game.', hintDraw: 'Turn over a card from the stock.',
      undoEmpty: 'Nothing to undo yet.', deal: 'deal #',
      rulesHtml: '<p>Build all cards onto the four foundations at the top right: each suit from ace to king.</p>' +
        '<ul><li>In the seven columns, build down in alternating colors: warm <b style="color:#b8283f">♥ ♦</b> and cool <b style="color:#262d55">♠ ♣</b>. A dark 7 goes on a red 8.</li>' +
        '<li>You can move several face-up cards at once if they are already in order.</li>' +
        '<li>Only a king can go into an empty column.</li>' +
        '<li>Tap the stock at the top left to turn cards over. When it runs out, tap it again to turn it back.</li>' +
        '<li>Drag cards, or just tap them: a card moves to the best place by itself.</li></ul>' +
        '<p><b>Score:</b> card to a foundation +10, stock to column +5, turn over a column card +5, card back from a foundation −15, recycle the stock −100 (−20 in draw three). Fast wins earn a bonus.</p>' +
        '<p><b>Keys:</b> <kbd>Space</kbd> stock, <kbd>Z</kbd> undo, <kbd>H</kbd> hint, <kbd>N</kbd> new game.</p>'
    }
  };
  function t(k) { return (T[settings.lang] || T.en)[k] || T.en[k] || k; }
  function applyText() {
    document.documentElement.lang = settings.lang;
    document.title = t('title');
    $$('[data-t]').forEach(function (el) { el.textContent = t(el.getAttribute('data-t')); });
    $$('[data-th]').forEach(function (el) { el.innerHTML = t(el.getAttribute('data-th')); });
    $$('[data-ta]').forEach(function (el) { el.setAttribute('aria-label', t(el.getAttribute('data-ta'))); el.title = t(el.getAttribute('data-ta')); });
    board.setAttribute('aria-label', t('title'));
    $$('[data-lang]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-lang') === settings.lang); });
    updateHud();
  }

  // ---------- cards ----------
  function suit(c) { return Math.floor(c / 13); }
  function rank(c) { return c % 13 + 1; }
  function red(c) { var s = suit(c); return s === 1 || s === 2; }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var x = a;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- game state ----------
  var G, history = [];
  var PILES = ['stock', 'waste', 'f0', 'f1', 'f2', 'f3', 't0', 't1', 't2', 't3', 't4', 't5', 't6'];

  function pile(ref) {
    if (ref === 'stock') return G.stock;
    if (ref === 'waste') return G.waste;
    return ref[0] === 'f' ? G.found[+ref[1]] : G.tab[+ref[1]];
  }
  function where(c) {
    for (var i = 0; i < PILES.length; i++) {
      var p = pile(PILES[i]), k = p.indexOf(c);
      if (k >= 0) return { ref: PILES[i], idx: k };
    }
    return null;
  }
  function top(p) { return p[p.length - 1]; }

  function deal(seed, draw) {
    var r = rng(seed * 2654435761), deck = [], i, j;
    for (i = 0; i < 52; i++) deck.push(i);
    for (i = 51; i > 0; i--) { j = Math.floor(r() * (i + 1)); var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp; }
    G = { seed: seed, draw: draw, stock: [], waste: [], found: [[], [], [], []], tab: [[], [], [], [], [], [], []],
          up: [], moves: 0, score: 0, time: 0, started: false, won: false };
    for (i = 0; i < 52; i++) G.up.push(false);
    for (i = 0; i < 7; i++) {
      for (j = i; j < 7; j++) G.tab[j].push(deck.pop());
    }
    for (i = 0; i < 7; i++) G.up[top(G.tab[i])] = true;
    G.stock = deck;
    history = [];
  }

  function canDrop(ids, ref) {
    var c = ids[0], p = pile(ref), tc = top(p);
    if (ref[0] === 'f') {
      if (ids.length !== 1) return false;
      if (!p.length) return rank(c) === 1;
      return suit(tc) === suit(c) && rank(c) === rank(tc) + 1;
    }
    if (ref[0] === 't') {
      if (!p.length) return rank(c) === 13;
      return G.up[tc] && red(tc) !== red(c) && rank(c) === rank(tc) - 1;
    }
    return false;
  }

  function snapshot() {
    history.push(JSON.stringify({ stock: G.stock, waste: G.waste, found: G.found, tab: G.tab, up: G.up, score: G.score }));
    if (history.length > 800) history.shift();
  }

  function moveCards(from, idx, to, opt) {
    opt = opt || {};
    if (!opt.noSnap) snapshot();
    var src = pile(from), ids = src.splice(idx);
    Array.prototype.push.apply(pile(to), ids);
    var s = 0;
    if (to[0] === 'f' && from[0] !== 'f') s += 10;
    if (from === 'waste' && to[0] === 't') s += 5;
    if (from[0] === 'f' && to[0] === 't') s -= 15;
    if (from[0] === 't' && src.length && !G.up[top(src)]) { G.up[top(src)] = true; s += 5; }
    G.score = Math.max(0, G.score + s);
    G.moves++;
    if (to[0] === 'f') splash(to, ids[0]);
    afterAction();
  }

  function drawStock(opt) {
    opt = opt || {};
    if (!G.stock.length && !G.waste.length) return false;
    if (!opt.noSnap) snapshot();
    if (!G.stock.length) {
      G.stock = G.waste.slice().reverse();
      G.waste = [];
      G.stock.forEach(function (c) { G.up[c] = false; });
      if (!opt.free) G.score = Math.max(0, G.score - (G.draw === 1 ? 100 : 20));
    } else {
      for (var n = Math.min(G.draw, G.stock.length); n > 0; n--) {
        var c = G.stock.pop();
        G.up[c] = true;
        G.waste.push(c);
      }
    }
    G.moves++;
    afterAction();
    return true;
  }

  function undo() {
    if (busy()) return;
    if (!history.length) { toast(t('undoEmpty')); return; }
    var s = JSON.parse(history.pop());
    G.stock = s.stock; G.waste = s.waste; G.found = s.found; G.tab = s.tab; G.up = s.up; G.score = s.score;
    G.moves++;
    cancelAuto();
    render();
    save();
    updateHud();
    updateFinish();
  }

  function afterAction() {
    if (!G.started) {
      G.started = true;
      stats.played++;
      saveStats();
    }
    render();
    updateHud();
    if (G.found.every(function (f) { return f.length === 13; })) { win(); return; }
    save();
    updateFinish();
    scheduleAuto();
  }

  function save() { store.set('wcsol.game', { G: G, history: history.slice(-200) }); }

  // ---------- smart targets ----------
  function foundTarget(c) {
    for (var i = 0; i < 4; i++) if (canDrop([c], 'f' + i)) return 'f' + i;
    return null;
  }
  function foundRank(s) {
    for (var i = 0; i < 4; i++) if (G.found[i].length && suit(G.found[i][0]) === s) return G.found[i].length;
    return 0;
  }
  function tabTarget(ids, from, fromIdx) {
    var i, ref, start = from[0] === 't' ? +from[1] + 1 : 0;
    for (var k = 0; k < 7; k++) {
      i = (start + k) % 7; ref = 't' + i;
      if (ref !== from && G.tab[i].length && canDrop(ids, ref)) return ref;
    }
    if (rank(ids[0]) === 13 && !(from[0] === 't' && fromIdx === 0)) {
      for (i = 0; i < 7; i++) if (!G.tab[i].length) return 't' + i;
    }
    return null;
  }
  // A card is safe to send home when nothing still on the table could need it.
  function safeHome(c) {
    var r = rank(c);
    if (r <= 2) return true;
    var opp = red(c) ? [0, 3] : [1, 2];
    return foundRank(opp[0]) >= r - 1 && foundRank(opp[1]) >= r - 1;
  }
  function findAutoMove(any) {
    var cands = [];
    if (G.waste.length) cands.push({ ref: 'waste', c: top(G.waste), idx: G.waste.length - 1 });
    for (var i = 0; i < 7; i++) if (G.tab[i].length && G.up[top(G.tab[i])]) cands.push({ ref: 't' + i, c: top(G.tab[i]), idx: G.tab[i].length - 1 });
    cands.sort(function (a, b) { return rank(a.c) - rank(b.c); });
    for (var k = 0; k < cands.length; k++) {
      var f = foundTarget(cands[k].c);
      if (f && (any || safeHome(cands[k].c))) return { from: cands[k].ref, idx: cands[k].idx, to: f };
    }
    return null;
  }

  var autoTimer = 0, finishing = false, winning = false;
  function busy() { return finishing || winning; }
  function cancelAuto() { clearTimeout(autoTimer); autoTimer = 0; }
  function scheduleAuto() {
    if (!settings.auto || autoTimer || finishing || G.won) return;
    autoTimer = setTimeout(function () {
      autoTimer = 0;
      if (drag || G.won) return;
      var m = findAutoMove(false);
      if (m) moveCards(m.from, m.idx, m.to, { noSnap: true });
    }, 170);
  }

  function canFinish() {
    if (G.won) return false;
    for (var i = 0; i < 7; i++) for (var j = 0; j < G.tab[i].length; j++) if (!G.up[G.tab[i][j]]) return false;
    return true;
  }
  function updateFinish() { $('#btnFinish').hidden = !canFinish() || finishing; }

  function finishAll() {
    if (busy() || !canFinish()) return;
    cancelAuto();
    snapshot();
    finishing = true;
    updateFinish();
    var guard = 0;
    (function step() {
      if (G.won || guard++ > 400) { finishing = false; return; }
      var m = findAutoMove(true);
      if (m) moveCards(m.from, m.idx, m.to, { noSnap: true });
      else if (!drawStock({ noSnap: true, free: true })) { finishing = false; updateFinish(); return; }
      if (!G.won) setTimeout(step, 95);
      else finishing = false;
    })();
  }

  // ---------- hints ----------
  function findHint() {
    var i, j, m = findAutoMove(true);
    if (m) return { cards: [top(pile(m.from))], to: m.to };
    // a column move that turns over a hidden card or empties a column
    for (i = 0; i < 7; i++) {
      var col = G.tab[i];
      for (j = 0; j < col.length; j++) if (G.up[col[j]]) break;
      if (j >= col.length) continue;
      var ids = col.slice(j);
      if (j === 0 && rank(ids[0]) === 13) continue;
      for (var k = 0; k < 7; k++) {
        if (k === i) continue;
        if (canDrop(ids, 't' + k) && (G.tab[k].length || j > 0)) return { cards: ids, to: 't' + k };
      }
    }
    if (G.waste.length) {
      var w = top(G.waste), tt = tabTarget([w], 'waste', 0);
      if (tt) return { cards: [w], to: tt };
    }
    if (G.stock.length || G.waste.length) return { stock: true };
    return null;
  }
  function showHint() {
    if (busy() || G.won) return;
    var h = findHint();
    clearHints();
    if (!h) { toast(t('noMoves')); return; }
    if (h.stock) {
      toast(t('hintDraw'));
      if (G.stock.length) els[top(G.stock)].classList.add('hint'); else slots.stock.classList.add('hint');
    } else {
      h.cards.forEach(function (c) { els[c].classList.add('hint'); });
      var p = pile(h.to);
      if (p.length) els[top(p)].classList.add('hint'); else slots[h.to].classList.add('hint');
    }
    hintTimer = setTimeout(clearHints, 1600);
  }
  var hintTimer = 0;
  function clearHints() {
    clearTimeout(hintTimer);
    $$('.hint').forEach(function (e) { e.classList.remove('hint'); });
  }

  // ---------- DOM ----------
  var els = [], slots = {}, L = null, paints = null;

  function build() {
    PILES.forEach(function (ref) {
      var s = document.createElement('div');
      s.className = 'slot' + (ref === 'stock' ? ' stock' : '');
      s.dataset.ref = ref;
      if (ref[0] === 'f') s.textContent = 'A';
      if (ref[0] === 't') s.textContent = 'K';
      if (ref === 'waste') s.style.visibility = 'hidden';
      board.appendChild(s);
      slots[ref] = s;
    });
    for (var c = 0; c < 52; c++) {
      var el = document.createElement('div');
      el.className = 'card down';
      el.dataset.id = c;
      var flip = document.createElement('div');
      flip.className = 'flip';
      var front = document.createElement('div');
      front.className = 'face front';
      front.appendChild(paints.faces[c]);
      var back = document.createElement('div');
      back.className = 'face back';
      flip.appendChild(front);
      flip.appendChild(back);
      el.appendChild(flip);
      board.appendChild(el);
      els.push(el);
    }
  }

  function computeLayout() {
    var W = board.clientWidth, H = board.clientHeight;
    var gapR = 0.13, pad = Math.max(8, Math.min(18, W * 0.015));
    var cw = (W - 2 * pad) / (7 + 6 * gapR);
    cw = Math.min(cw, 130, (H - 2 * pad) / (1.4 * 2.7));
    cw = Math.max(cw, 30);
    var ch = cw * 1.4, gap = cw * gapR;
    var left = (W - (7 * cw + 6 * gap)) / 2;
    if (!L || L.cw !== cw) {
      board.style.setProperty('--cw', cw + 'px');
      board.style.setProperty('--ch', ch + 'px');
    }
    L = { W: W, H: H, cw: cw, ch: ch, gap: gap, left: left, top: pad, pad: pad, tabTop: pad + ch + Math.max(gap * 1.4, 10) };
  }
  function colX(i) { return L.left + i * (L.cw + L.gap); }

  // Where every card should be, given the state.
  function positions(dealing) {
    var pos = [], i, j;
    G.stock.forEach(function (c, k) { pos[c] = { x: colX(0), y: L.top, z: 1 + k, up: false, flat: k < G.stock.length - 3 }; });
    var vis = G.draw === 3 ? Math.min(3, G.waste.length) : 1;
    G.waste.forEach(function (c, k) {
      var f = Math.max(0, k - (G.waste.length - vis));
      pos[c] = { x: colX(1) + f * L.cw * 0.24, y: L.top, z: 100 + k, up: true, flat: k < G.waste.length - 3 };
    });
    for (i = 0; i < 4; i++) G.found[i].forEach(function (c, k) { pos[c] = { x: colX(3 + i), y: L.top, z: 200 + k, up: true, flat: k < G.found[i].length - 2 }; });
    var avail = L.H - L.tabTop - L.ch - L.pad;
    for (i = 0; i < 7; i++) {
      var col = G.tab[i], down = 0, upc = 0;
      col.forEach(function (c, k) { if (k < col.length - 1) { if (G.up[c]) upc++; else down++; } });
      var fd = L.ch * 0.1, fu = L.ch * 0.27, need = down * fd + upc * fu;
      if (need > avail && need > 0) {
        var k2 = Math.max(0, avail) / need;
        fd = Math.max(L.ch * 0.035, fd * k2);
        fu = Math.max(L.ch * 0.13, fu * k2);
      }
      var y = L.tabTop;
      for (j = 0; j < col.length; j++) {
        var c2 = col[j];
        pos[c2] = { x: colX(i), y: y, z: 300 + j, up: dealing ? false : G.up[c2] };
        y += G.up[c2] ? fu : fd;
      }
    }
    return pos;
  }

  function render(opt) {
    opt = opt || {};
    if (!L) computeLayout();
    var pos = positions(opt.dealing);
    slots.stock.style.transform = 'translate(' + colX(0) + 'px,' + L.top + 'px)';
    slots.stock.textContent = G.stock.length || !G.waste.length ? '' : '↻';
    slots.stock.classList.toggle('recycle', !G.stock.length && G.waste.length > 0);
    slots.waste.style.transform = 'translate(' + colX(1) + 'px,' + L.top + 'px)';
    for (var i = 0; i < 4; i++) slots['f' + i].style.transform = 'translate(' + colX(3 + i) + 'px,' + L.top + 'px)';
    for (i = 0; i < 7; i++) slots['t' + i].style.transform = 'translate(' + colX(i) + 'px,' + L.tabTop + 'px)';
    for (var c = 0; c < 52; c++) {
      var p = pos[c], el = els[c];
      if (!p) continue;
      var moved = el._x !== p.x || el._y !== p.y;
      el.classList.remove('dragging', 'lift');
      el.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)';
      el.classList.toggle('down', !p.up);
      el.classList.toggle('flat', !!p.flat);
      clearTimeout(el._zt);
      if (moved && !opt.instant && el._x !== undefined) {
        el.style.zIndex = 600 + p.z; // fly above the other cards, then settle
        el._zt = setTimeout(setZ.bind(null, el, p.z), 330 + (parseFloat(el.style.transitionDelay) || 0));
      } else {
        el.style.zIndex = p.z;
      }
      el._x = p.x; el._y = p.y;
    }
  }
  function setZ(el, z) { el.style.zIndex = z; }

  function relayout() {
    board.classList.add('noanim');
    computeLayout();
    render({ instant: true });
    void board.offsetWidth;
    board.classList.remove('noanim');
  }

  function animateDeal() {
    // gather everything on the stock, then deal column by column
    board.classList.add('noanim');
    computeLayout();
    els.forEach(function (el, c) {
      el.style.transform = 'translate(' + colX(0) + 'px,' + L.top + 'px)';
      el.classList.add('down');
      el.style.zIndex = 52 - c;
      el._x = colX(0); el._y = L.top;
    });
    void board.offsetWidth;
    board.classList.remove('noanim');
    var order = 0;
    for (var row = 0; row < 7; row++) {
      for (var col = row; col < 7; col++) els[G.tab[col][row]].style.transitionDelay = (order++ * 40) + 'ms';
    }
    render({ dealing: true });
    setTimeout(function () {
      els.forEach(function (el) { el.style.transitionDelay = ''; });
      render();
    }, order * 40 + 320);
  }

  function splash(ref, c) {
    if (!paints) return;
    var img = document.createElement('img');
    var size = L.cw * 1.9;
    img.src = paints.splash[suit(c)];
    img.className = 'splash';
    img.alt = '';
    img.style.width = img.style.height = size + 'px';
    img.style.transform = 'translate(' + (colX(3 + +ref[1]) + L.cw / 2 - size / 2) + 'px,' + (L.top + L.ch / 2 - size / 2) + 'px)';
    img.style.zIndex = 150;
    board.appendChild(img);
    setTimeout(function () { img.remove(); }, 950);
  }

  function shake(ids) {
    ids.forEach(function (c) {
      var el = els[c];
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      setTimeout(function () { el.classList.remove('shake'); }, 340);
    });
  }

  // ---------- input ----------
  var drag = null;

  board.addEventListener('pointerdown', function (e) {
    if (busy() || G.won || e.button > 0) return;
    clearHints();
    var el = e.target.closest('.card');
    var slot = e.target.closest('.slot');
    if (!el) {
      if (slot && slot.dataset.ref === 'stock') { cancelAuto(); drawStock(); }
      return;
    }
    var c = +el.dataset.id, w = where(c);
    if (w.ref === 'stock') { cancelAuto(); drawStock(); return; }
    if (!G.up[c]) return;
    var p = pile(w.ref);
    if (w.ref[0] !== 't' && w.idx !== p.length - 1) return;
    cancelAuto();
    var ids = p.slice(w.idx);
    drag = { c: c, ref: w.ref, idx: w.idx, ids: ids, sx: e.clientX, sy: e.clientY, moved: false,
             origin: ids.map(function (id) { return { x: els[id]._x, y: els[id]._y }; }) };
    try { board.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
    e.preventDefault();
  });

  board.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved) {
      if (Math.abs(dx) + Math.abs(dy) < 6) return;
      drag.moved = true;
      drag.ids.forEach(function (id, k) {
        clearTimeout(els[id]._zt);
        els[id].classList.add('dragging', 'lift');
        els[id].style.zIndex = 2000 + k;
      });
    }
    drag.ids.forEach(function (id, k) {
      els[id].style.transform = 'translate(' + (drag.origin[k].x + dx) + 'px,' + (drag.origin[k].y + dy) + 'px)';
    });
    drag.dx = dx; drag.dy = dy;
  });

  function endDrag(e, cancelled) {
    if (!drag) return;
    var d = drag;
    drag = null;
    if (!d.moved) {
      if (!cancelled) tap(d);
      return;
    }
    var target = cancelled ? null : dropTarget(d);
    if (target) moveCards(d.ref, d.idx, target);
    else render();
  }
  board.addEventListener('pointerup', function (e) { endDrag(e, false); });
  board.addEventListener('pointercancel', function (e) { endDrag(e, true); });
  board.addEventListener('lostpointercapture', function (e) { if (drag && drag.moved) endDrag(e, false); });

  function dropTarget(d) {
    var x0 = d.origin[0].x + d.dx, y0 = d.origin[0].y + d.dy, best = null, bestA = 0;
    var refs = ['f0', 'f1', 'f2', 'f3', 't0', 't1', 't2', 't3', 't4', 't5', 't6'];
    refs.forEach(function (ref) {
      if (ref === d.ref || !canDrop(d.ids, ref)) return;
      var p = pile(ref), rx, ry;
      if (p.length) { rx = els[top(p)]._x; ry = els[top(p)]._y; }
      else { rx = ref[0] === 'f' ? colX(3 + +ref[1]) : colX(+ref[1]); ry = ref[0] === 'f' ? L.top : L.tabTop; }
      var ox = Math.min(x0 + L.cw, rx + L.cw) - Math.max(x0, rx);
      var oy = Math.min(y0 + L.ch, ry + L.ch) - Math.max(y0, ry);
      var a = ox > 0 && oy > 0 ? ox * oy : 0;
      if (a > bestA) { bestA = a; best = ref; }
    });
    return best;
  }

  function tap(d) {
    if (!settings.tap) return;
    var c = d.c;
    if (d.ids.length === 1 && d.ref[0] !== 'f') {
      var f = foundTarget(c);
      if (f) { moveCards(d.ref, d.idx, f); return; }
    }
    var to = tabTarget(d.ids, d.ref, d.idx);
    if (to) { moveCards(d.ref, d.idx, to); return; }
    shake(d.ids);
  }

  document.addEventListener('keydown', function (e) {
    if (document.querySelector('dialog[open]') || !paints) return;
    var k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); undo(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'z' || k === 'я') undo();
    else if (k === 'h' || k === 'р') showHint();
    else if (k === 'n' || k === 'т') openDialog('#dlgNew');
    else if (k === ' ' || k === 'd' || k === 'в') { e.preventDefault(); if (!busy() && !G.won) { cancelAuto(); drawStock(); } }
  });

  // ---------- HUD, timer, toast ----------
  function fmtTime(s) { var m = Math.floor(s / 60); s = s % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function updateHud() {
    if (!G) return;
    $('#hudTime').textContent = fmtTime(G.time);
    $('#hudMoves').textContent = G.moves;
    $('#hudScore').textContent = G.score;
    $('#dealNo').textContent = t('deal') + G.seed + ' · ' + (G.draw === 3 ? t('draw3') : t('draw1')).toLowerCase();
    $('#btnUndo').disabled = !history.length;
  }
  setInterval(function () {
    if (!G || !G.started || G.won || document.hidden || !paints) return;
    G.time++;
    updateHud();
    if (G.time % 5 === 0) save();
  }, 1000);

  var toastTimer = 0;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  // ---------- new game / win ----------
  function startGame(seed, draw) {
    cancelAuto();
    if (G && G.started && !G.won) { stats.streak = 0; saveStats(); }
    finishing = false;
    deal(seed, draw);
    store.set('wcsol.game', { G: G, history: [] });
    updateHud();
    updateFinish();
    animateDeal();
  }
  function randomSeed() { return 1 + Math.floor(Math.random() * 999999); }

  function win() {
    G.won = true;
    cancelAuto();
    var bonus = G.time >= 30 ? Math.round(700000 / G.time / 10) : 2300;
    G.bonus = bonus;
    var total = G.score + bonus;
    stats.won++;
    stats.streak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
    if (!stats.bestTime || G.time < stats.bestTime) stats.bestTime = G.time;
    stats.bestScore = Math.max(stats.bestScore, total);
    saveStats();
    store.set('wcsol.game', null);
    updateFinish();
    setTimeout(winAnimation, 450);
  }

  function showWin() {
    var total = G.score + (G.bonus || 0);
    fillList('#winList', [
      [t('time'), fmtTime(G.time)], [t('moves'), G.moves], [t('score'), G.score],
      [t('timeBonus'), '+' + (G.bonus || 0)], [t('total'), total], [t('streak'), stats.streak]
    ]);
    openDialog('#dlgWin');
  }

  // Cards bounce off the bottom of the screen and leave translucent paint trails.
  function winAnimation() {
    var cv = $('#fx'), dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.hidden = false;
    cv.style.opacity = 1;
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    var br = board.getBoundingClientRect(), queue = [];
    for (var r = 12; r >= 0; r--) for (var f = 0; f < 4; f++) if (G.found[f][r] !== undefined) queue.push(G.found[f][r]);
    var live = [], frame = 0, done = false;
    winning = true;
    function finish() {
      if (done) return;
      done = true;
      winning = false;
      cv.style.opacity = 0;
      setTimeout(function () { cv.hidden = true; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); }, 600);
      els.forEach(function (el) { el.style.visibility = ''; });
      showWin();
    }
    cv.onclick = finish;
    (function loop() {
      if (done) return;
      if (frame % 9 === 0 && queue.length) {
        var c = queue.shift(), el = els[c];
        el.style.visibility = 'hidden';
        live.push({ c: c, x: br.left + el._x, y: br.top + el._y, vx: (2.5 + Math.random() * 4.5) * (Math.random() < 0.5 ? -1 : 1), vy: -Math.random() * 7 });
      }
      ctx.globalAlpha = 0.33;
      live = live.filter(function (p) {
        p.vy += 0.55; p.x += p.vx; p.y += p.vy;
        if (p.y + L.ch > H) { p.y = H - L.ch; p.vy = -p.vy * 0.78; }
        ctx.drawImage(paints.faces[p.c], p.x, p.y, L.cw, L.ch);
        return p.x > -L.cw && p.x < W;
      });
      frame++;
      if (!queue.length && !live.length) { setTimeout(finish, 500); return; }
      requestAnimationFrame(loop);
    })();
  }

  // ---------- dialogs ----------
  function openDialog(sel) {
    var d = $(sel);
    if (sel === '#dlgNew') $('#dealInput').value = G.seed;
    if (sel === '#dlgStats') renderStats();
    if (sel === '#dlgSettings') renderSettings();
    if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', '');
  }
  function closeDialog(d) { if (d.close) d.close(); else d.removeAttribute('open'); }
  $$('dialog').forEach(function (d) {
    d.addEventListener('click', function (e) {
      if (e.target === d || e.target.closest('[data-close]')) closeDialog(d);
    });
  });

  function fillList(sel, rows) {
    var dl = $(sel);
    dl.innerHTML = '';
    rows.forEach(function (r) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = r[0]; dd.textContent = r[1];
      dl.appendChild(dt); dl.appendChild(dd);
    });
  }
  function renderStats() {
    fillList('#statsList', [
      [t('played'), stats.played], [t('won'), stats.won],
      [t('winRate'), stats.played ? Math.round(stats.won / stats.played * 100) + '%' : '—'],
      [t('bestTime'), stats.bestTime ? fmtTime(stats.bestTime) : '—'], [t('bestScore'), stats.bestScore || '—'],
      [t('streak'), stats.streak], [t('bestStreak'), stats.bestStreak]
    ]);
  }

  var tableUrls = {};
  function tableUrl(kind) {
    if (!tableUrls[kind]) tableUrls[kind] = Watercolor.table(kind).toDataURL('image/jpeg', 0.86);
    return tableUrls[kind];
  }
  function applyLook() {
    board.style.setProperty('--back', 'url(' + backUrls[settings.back] + ')');
    document.body.style.setProperty('--table', 'url(' + tableUrl(settings.table) + ')');
  }
  var backUrls = {};
  function renderSettings() {
    var bc = $('#backChoices'), tc = $('#tableChoices');
    bc.innerHTML = ''; tc.innerHTML = '';
    ['night', 'meadow', 'sunset'].forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'swatch' + (settings.back === k ? ' on' : '');
      b.innerHTML = '<img alt=""><span></span>';
      b.querySelector('img').src = backUrls[k];
      b.querySelector('span').textContent = t('back_' + k);
      b.onclick = function () { settings.back = k; saveSettings(); applyLook(); renderSettings(); };
      bc.appendChild(b);
    });
    ['paper', 'sage', 'dusk'].forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'swatch' + (settings.table === k ? ' on' : '');
      b.innerHTML = '<span class="tbl"></span><span></span>';
      b.querySelector('.tbl').style.backgroundImage = 'url(' + tableUrl(k) + ')';
      b.querySelectorAll('span')[1].textContent = t('table_' + k);
      b.onclick = function () { settings.table = k; saveSettings(); applyLook(); renderSettings(); };
      tc.appendChild(b);
    });
    $('#optAuto').checked = settings.auto;
    $('#optTap').checked = settings.tap;
  }
  $('#optAuto').onchange = function () { settings.auto = this.checked; saveSettings(); if (settings.auto) scheduleAuto(); };
  $('#optTap').onchange = function () { settings.tap = this.checked; saveSettings(); };
  $$('[data-lang]').forEach(function (b) {
    b.onclick = function () { settings.lang = b.getAttribute('data-lang'); saveSettings(); applyText(); renderSettings(); };
  });

  $('#btnNew').onclick = function () { if (!busy()) openDialog('#dlgNew'); };
  $('#btnUndo').onclick = undo;
  $('#btnHint').onclick = showHint;
  $('#btnStats').onclick = function () { openDialog('#dlgStats'); };
  $('#btnSettings').onclick = function () { openDialog('#dlgSettings'); };
  $('#btnRules').onclick = function () { openDialog('#dlgRules'); };
  $('#btnFinish').onclick = finishAll;
  $$('[data-new]').forEach(function (b) {
    b.onclick = function () {
      settings.draw = +b.getAttribute('data-new');
      saveSettings();
      closeDialog($('#dlgNew'));
      startGame(randomSeed(), settings.draw);
    };
  });
  $('#btnRestart').onclick = function () { closeDialog($('#dlgNew')); startGame(G.seed, G.draw); };
  $('#dealForm').onsubmit = function (e) {
    e.preventDefault();
    var n = Math.floor(+$('#dealInput').value);
    if (n >= 1 && n <= 999999) { closeDialog($('#dlgNew')); startGame(n, settings.draw); }
  };
  $('#btnResetStats').onclick = function () {
    if (!confirm(t('resetAsk'))) return;
    stats = { played: 0, won: 0, streak: 0, bestStreak: 0, bestTime: 0, bestScore: 0 };
    saveStats();
    renderStats();
  };
  $('#btnWinNew').onclick = function () { closeDialog($('#dlgWin')); };
  $('#dlgWin').addEventListener('close', function () { if (G.won) startGame(randomSeed(), settings.draw); });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (paints && !winning) relayout(); }, 60);
  });

  // ---------- start ----------
  applyText();
  Watercolor.init(function (p) { $('#loadBar').style.width = Math.round(p * 100) + '%'; }).then(function (res) {
    paints = res;
    Object.keys(res.backs).forEach(function (k) { backUrls[k] = res.backs[k].toDataURL(); });
    applyLook();
    build();
    var saved = store.get('wcsol.game', null);
    if (saved && saved.G && !saved.G.won && saved.G.tab) {
      G = saved.G;
      history = saved.history || [];
      computeLayout();
      render({ instant: true });
      updateHud();
      updateFinish();
    } else {
      deal(randomSeed(), settings.draw);
      updateHud();
      animateDeal();
    }
    $('#loading').classList.add('done');
    setTimeout(function () { $('#loading').hidden = true; }, 600);
  });
})();
