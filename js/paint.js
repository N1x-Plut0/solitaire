/* Watercolor painter.
   Every card face, the card backs, the table and the paint splashes are painted once on <canvas>
   when the page loads. A wash is many translucent layers of a slightly deformed polygon
   (Tyler Hobbs' generative watercolor technique), on top of noisy paper with pigment granulation.
   Everything is seeded, so the cards look the same on every visit. */
(function () {
  'use strict';

  var CW = 250, CH = 350, RAD = 20;
  var FONT = '"Caveat", "Segoe Print", "Comic Sans MS", cursive';
  var PAPER = [251, 247, 234];

  // Spades and clubs are cool "dark" suits, hearts and diamonds are warm "red" ones.
  var SUITS = [
    { wash: ['#34427f', '#5a3f86'], ink: '#262d55' },
    { wash: ['#d2344c', '#e65d7d'], ink: '#a8203a' },
    { wash: ['#e4572a', '#f0943f'], ink: '#b63e17' },
    { wash: ['#2c6a4d', '#1f5e6e'], ink: '#1d3b31' }
  ];
  var RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  // ---------- small helpers ----------
  function rng(seed) { // mulberry32
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) {
    var u = 0;
    while (!u) u = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
  }
  function hex(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mix(a, b, t) { return [0, 1, 2].map(function (i) { return Math.round(a[i] + (b[i] - a[i]) * t); }); }
  function light(h, t) { return mix(hex(h), [255, 255, 255], t); }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function cols(list) { return list.map(function (c) { return typeof c === 'string' ? hex(c) : c; }); }

  function tracePoly(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (var i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath();
  }

  // Split every edge and push the new point off in a random direction.
  function deform(pts, depth, amt, r) {
    var p = pts;
    for (var d = 0; d < depth; d++) {
      var out = [];
      for (var i = 0; i < p.length; i++) {
        var a = p[i], b = p[(i + 1) % p.length];
        out.push(a);
        var len = Math.hypot(b.x - a.x, b.y - a.y);
        var v = (a.v + b.v) / 2;
        var g = gauss(r) * len * amt * v;
        var ang = r() * Math.PI * 2;
        out.push({ x: (a.x + b.x) / 2 + Math.cos(ang) * g, y: (a.y + b.y) / 2 + Math.sin(ang) * g, v: v * (0.8 + r() * 0.4) });
      }
      p = out;
    }
    return p;
  }

  // One watercolor wash: layered translucent deformations of a shape, darker where the pigment dried at the edge.
  function wash(ctx, pts, colors, o, r) {
    o = Object.assign({ layers: 24, alpha: 0.06, amt: 0.6, spread: 2, edge: 0.2, edgeW: 1.2 }, o || {});
    var c = cols(colors);
    var src = pts.map(function (p) { return { x: p.x, y: p.y, v: p.v == null ? 1 : p.v }; });
    var base = deform(src, 1, o.amt * 0.6, r);
    var groups = [deform(base, 1, o.amt, r), deform(base, 1, o.amt, r), deform(base, 1, o.amt, r)];
    for (var l = 0; l < o.layers; l++) {
      var p = deform(groups[l % 3], o.spread, o.amt, r);
      ctx.fillStyle = rgba(c.length > 1 ? mix(c[0], c[1], r()) : c[0], o.alpha);
      tracePoly(ctx, p);
      ctx.fill();
    }
    if (o.edge) {
      ctx.strokeStyle = rgba(c[0], o.edge);
      ctx.lineWidth = o.edgeW;
      ctx.lineJoin = 'round';
      tracePoly(ctx, groups[0]);
      ctx.stroke();
    }
  }

  // A pen line that wobbles a little, drawn twice like a sketch.
  function ink(ctx, pts, closed, w, color, r, jit) {
    jit = jit == null ? 0.9 : jit;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var k = 0; k < 2; k++) {
      ctx.beginPath();
      for (var i = 0; i < pts.length; i++) {
        var x = pts[i].x + (r() - 0.5) * jit, y = pts[i].y + (r() - 0.5) * jit;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      if (closed) ctx.closePath();
      ctx.globalAlpha = k ? 0.4 : 0.85;
      ctx.lineWidth = k ? w * 0.6 : w;
      ctx.stroke();
    }
    ctx.restore();
  }

  function spatter(ctx, cx, cy, rad, n, color, r, size, alpha) {
    var c = cols([color])[0];
    for (var i = 0; i < n; i++) {
      var a = r() * Math.PI * 2, d = rad * Math.sqrt(r());
      ctx.fillStyle = rgba(c, (alpha || 0.6) * (0.5 + r() * 0.5));
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.6 + r() * size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function place(shape, cx, cy, s, rot) {
    var co = Math.cos(rot || 0), si = Math.sin(rot || 0);
    return shape.map(function (p) { return { x: cx + (p.x * co - p.y * si) * s, y: cy + (p.x * si + p.y * co) * s }; });
  }
  function circle(cx, cy, rx, ry, n, rot) {
    var out = [], co = Math.cos(rot || 0), si = Math.sin(rot || 0);
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * (ry || rx);
      out.push({ x: cx + x * co - y * si, y: cy + x * si + y * co });
    }
    return out;
  }
  function densify(pts, step) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (var k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n });
    }
    return out;
  }
  function rect(x, y, w, h, step) {
    return densify([{ x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }], step);
  }
  function roundRect(ctx, x, y, w, h, rr) {
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  // ---------- suit shapes: an inside() test in [-1, 1], turned into an outline by casting rays from the center ----------
  function heartAt(X, Y) { var a = X * X + Y * Y - 1; return a * a * a - X * X * Y * Y * Y <= 0; }
  function stem(x, y, top) { return y >= top && y <= 0.98 && Math.abs(x) <= 0.34 * Math.pow((y - top) / (0.98 - top), 1.5) + 0.08; }
  var INSIDE = [
    function (x, y) { return heartAt(x * 1.25, (y + 0.12) * 1.35 + 0.12) || stem(x, y, 0.25); },
    function (x, y) { return heartAt(x * 1.18, -y * 1.15 + 0.12); },
    function (x, y) { return Math.pow(Math.abs(x) / 0.78, 0.85) + Math.pow(Math.abs(y) / 0.98, 0.85) <= 1; },
    function (x, y) {
      function inC(cx, cy, cr) { return (x - cx) * (x - cx) + (y - cy) * (y - cy) <= cr * cr; }
      return inC(0, -0.47, 0.36) || inC(-0.43, 0.1, 0.36) || inC(0.43, 0.1, 0.36) || inC(0, 0, 0.24) || stem(x, y, 0.15);
    }
  ];
  function outline(inside, n) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = i / n * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a), rr = 1.5;
      while (rr > 0 && !inside(dx * rr, dy * rr)) rr -= 0.008;
      pts.push({ x: dx * rr, y: dy * rr });
    }
    return pts;
  }
  var SHAPES = INSIDE.map(function (f) { return densify(outline(f, 140), 0.05); });

  // ---------- paper ----------
  function paper(w, h, base, seed, amp) {
    var c = mk(w, h), x = c.getContext('2d'), r = rng(seed);
    var img = x.createImageData(w, h), d = img.data;
    var gs = 10, gw = Math.ceil(w / gs) + 2, gh = Math.ceil(h / gs) + 2, grid = new Float32Array(gw * gh);
    for (var i = 0; i < grid.length; i++) grid[i] = r() - 0.5;
    for (var y = 0; y < h; y++) {
      var gy = y / gs, y0 = gy | 0, fy = gy - y0;
      for (var xx = 0; xx < w; xx++) {
        var gx = xx / gs, x0 = gx | 0, fx = gx - x0;
        var a = grid[y0 * gw + x0], b = grid[y0 * gw + x0 + 1], cc = grid[(y0 + 1) * gw + x0], dd = grid[(y0 + 1) * gw + x0 + 1];
        var n = ((a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + dd * fx) * fy) * 12 + (r() - 0.5) * 9;
        n *= amp;
        var k = (y * w + xx) * 4;
        d[k] = base[0] + n; d[k + 1] = base[1] + n; d[k + 2] = base[2] + n * 1.15; d[k + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    return c;
  }
  // Grain: light specks that darken pigment when multiplied over a painting.
  function grain(w, h, seed) {
    var c = mk(w, h), x = c.getContext('2d'), r = rng(seed);
    var img = x.createImageData(w, h), d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      var v = 255 - (r() < 0.35 ? r() * 26 : r() * 6);
      d[i] = d[i + 1] = v; d[i + 2] = v - 2; d[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  var cardPaper, cardGrain, pipStamps = [];

  // A pip painted once at large size, then stamped (slightly turned) on every card.
  function makePip(s, seed) {
    var S = 160, c = mk(S, S), x = c.getContext('2d'), r = rng(seed);
    wash(x, place(SHAPES[s], S / 2, S / 2, 62), SUITS[s].wash, { layers: 26, alpha: 0.075, amt: 0.7, edge: 0.35, edgeW: 1.6 }, r);
    // a lighter bloom where the water pooled
    x.globalCompositeOperation = 'destination-out';
    wash(x, circle(S / 2 - 12 + r() * 10, S / 2 - 16 + r() * 8, 14 + r() * 8, 12 + r() * 6, 14), ['#000000'], { layers: 8, alpha: 0.035, amt: 0.5, edge: 0 }, r);
    x.globalCompositeOperation = 'source-over';
    return c;
  }
  function stamp(ctx, s, cx, cy, size, rot, r) {
    var v = pipStamps[s][Math.floor(r() * pipStamps[s].length)];
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rot || 0) + (r() - 0.5) * 0.08);
    ctx.drawImage(v, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // Pip spots for 2..10, in a box that spans 0..1 both ways.
  var PIPS = {
    2: [[.5, 0], [.5, 1]],
    3: [[.5, 0], [.5, .5], [.5, 1]],
    4: [[0, 0], [1, 0], [0, 1], [1, 1]],
    5: [[0, 0], [1, 0], [.5, .5], [0, 1], [1, 1]],
    6: [[0, 0], [1, 0], [0, .5], [1, .5], [0, 1], [1, 1]],
    7: [[0, 0], [1, 0], [.5, .25], [0, .5], [1, .5], [0, 1], [1, 1]],
    8: [[0, 0], [1, 0], [.5, .25], [0, .5], [1, .5], [.5, .75], [0, 1], [1, 1]],
    9: [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [.5, .5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
    10: [[0, 0], [1, 0], [.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [.5, 5 / 6], [0, 1], [1, 1]]
  };

  function frame(x, s, r) {
    var fx = 24, fy = 98, fw = CW - 48, fh = CH - 120;
    wash(x, rect(fx - 6, fy - 6, fw + 12, fh + 12, 14), [light(SUITS[s].wash[0], 0.8), light(SUITS[s].wash[1], 0.85)], { layers: 16, alpha: 0.05, amt: 0.45, edge: 0.12 }, r);
    var p = [], rr = 10;
    for (var i = 0; i <= 8; i++) { // rounded corners
      var a = i / 8 * Math.PI / 2;
      p.push({ x: fx + fw - rr + Math.sin(a) * rr, y: fy + rr - Math.cos(a) * rr });
    }
    p = densify([{ x: fx + rr, y: fy }].concat(p, [{ x: fx + fw, y: fy + fh - rr }, { x: fx + fw - rr, y: fy + fh }, { x: fx + rr, y: fy + fh }, { x: fx, y: fy + fh - rr }, { x: fx, y: fy + rr }]), 7);
    ink(x, p, true, 1.6, SUITS[s].ink, r, 1.1);
  }

  function king(x, s, r) {
    frame(x, s, r);
    var cx = CW / 2, cy = 168;
    var crown = [[-1, .5], [-1.12, -.6], [-.55, -.05], [0, -.82], [.55, -.05], [1.12, -.6], [1, .5]]
      .map(function (p) { return { x: cx + p[0] * 62, y: cy + p[1] * 56 }; });
    var cr = densify(crown, 7);
    wash(x, cr, ['#d99d36', '#ecc65e'], { layers: 26, alpha: 0.07, amt: 0.55, edge: 0.4 }, r);
    var band = rect(cx - 64, cy + 26, 128, 20, 7);
    wash(x, band, SUITS[s].wash, { layers: 20, alpha: 0.07, amt: 0.5, edge: 0.3 }, r);
    [[-1.12, -.6], [0, -.82], [1.12, -.6]].forEach(function (p) {
      wash(x, circle(cx + p[0] * 62, cy + p[1] * 56 - 6, 9, 9, 16), SUITS[s].wash, { layers: 14, alpha: 0.1, amt: 0.5, edge: 0.3 }, r);
      ink(x, circle(cx + p[0] * 62, cy + p[1] * 56 - 6, 8, 8, 14), true, 1.3, SUITS[s].ink, r);
    });
    ink(x, densify(crown, 9), true, 1.8, SUITS[s].ink, r);
    ink(x, rect(cx - 64, cy + 26, 128, 20, 9), true, 1.6, SUITS[s].ink, r);
    for (var i = -2; i <= 2; i++) spatter(x, cx + i * 24, cy + 36, 2, 1, SUITS[s].ink, r, 2.2, 0.8);
    stamp(x, s, cx, 268, 104, 0, r);
    ink(x, place(SHAPES[s], cx + 2, 266, 41), true, 1.4, SUITS[s].ink, r);
  }

  function queen(x, s, r) {
    frame(x, s, r);
    var cx = CW / 2, cy = 170, i;
    // stem and leaves first, flower on top
    ink(x, [{ x: cx, y: cy + 40 }, { x: cx - 4, y: cy + 80 }, { x: cx + 2, y: cy + 120 }, { x: cx, y: cy + 140 }], false, 2.2, '#2f5a33', r);
    [[-1, 236], [1, 222]].forEach(function (l) {
      var ang = l[0] < 0 ? Math.PI * 0.85 : Math.PI * 0.15;
      var lp = leaf(cx, l[1], cx + Math.cos(ang) * 62, l[1] - Math.sin(ang) * 26, 14);
      wash(x, lp, ['#4f8a3e', '#6fa04a'], { layers: 18, alpha: 0.08, amt: 0.45, edge: 0.35 }, r);
      ink(x, [{ x: cx, y: l[1] }, { x: cx + Math.cos(ang) * 58, y: l[1] - Math.sin(ang) * 24 }], false, 1.2, '#2f5a33', r);
    });
    var c1 = light(SUITS[s].wash[0], 0.15), c2 = light(SUITS[s].wash[1], 0.4);
    for (i = 0; i < 7; i++) {
      var a = i / 7 * Math.PI * 2 - Math.PI / 2, px = cx + Math.cos(a) * 30, py = cy + Math.sin(a) * 30;
      wash(x, circle(px, py, 34, 21, 26, a), [c1, c2], { layers: 12, alpha: 0.07, amt: 0.5, edge: 0.3 }, r);
    }
    for (i = 0; i < 7; i++) {
      var b = i / 7 * Math.PI * 2 - Math.PI / 2;
      ink(x, circle(cx + Math.cos(b) * 32, cy + Math.sin(b) * 32, 32, 19, 22, b), true, 1.2, SUITS[s].ink, r, 1.2);
    }
    wash(x, circle(cx, cy, 17, 17, 22), ['#d99d36', '#ecc65e'], { layers: 16, alpha: 0.1, amt: 0.5, edge: 0.4 }, r);
    spatter(x, cx, cy, 12, 10, '#8a5a12', r, 1.6, 0.7);
    stamp(x, s, cx, 300, 50, 0, r);
  }

  function leaf(x0, y0, x1, y1, w) {
    var pts = [], dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, i, t, hw;
    for (i = 0; i <= 14; i++) { t = i / 14; hw = Math.pow(Math.sin(Math.PI * t), 0.8) * w; pts.push({ x: x0 + dx * t + nx * hw, y: y0 + dy * t + ny * hw }); }
    for (i = 13; i > 0; i--) { t = i / 14; hw = Math.pow(Math.sin(Math.PI * t), 0.8) * w; pts.push({ x: x0 + dx * t - nx * hw, y: y0 + dy * t - ny * hw }); }
    return pts;
  }

  function jack(x, s, r) {
    frame(x, s, r);
    var x0 = 70, y0 = 318, x1 = 176, y1 = 118;
    wash(x, leaf(x0 + 8, y0 - 16, x1, y1, 30), [light(SUITS[s].wash[0], 0.1), light(SUITS[s].wash[1], 0.45)], { layers: 26, alpha: 0.065, amt: 0.5, edge: 0.35 }, r);
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    ink(x, [{ x: x0, y: y0 }, { x: x0 + dx * 0.5, y: y0 + dy * 0.5 + 2 }, { x: x1, y: y1 }], false, 2, SUITS[s].ink, r);
    for (var i = 2; i < 13; i++) { // barbs, with a couple of splits
      if (i === 6 || i === 10) continue;
      var t = 0.08 + i / 14 * 0.85, hw = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.8) * 27;
      var bx = x0 + dx * t, by = y0 + dy * t;
      [-1, 1].forEach(function (side) {
        ink(x, [{ x: bx, y: by }, { x: bx + nx * hw * side + dx / len * 10, y: by + ny * hw * side + dy / len * 10 }], false, 0.9, SUITS[s].ink, r, 0.6);
      });
    }
    spatter(x, 100, 170, 28, 9, SUITS[s].wash[0], r, 2.4, 0.5);
    stamp(x, s, 182, 292, 58, 0, r);
  }

  function ace(x, s, r) {
    var cx = CW / 2, cy = 214;
    wash(x, circle(cx, cy, 92, 96, 16), [light(SUITS[s].wash[1], 0.7), light(SUITS[s].wash[0], 0.82)], { layers: 18, alpha: 0.045, amt: 0.9, edge: 0.1 }, r);
    wash(x, place(SHAPES[s], cx, cy, 70), SUITS[s].wash, { layers: 34, alpha: 0.065, amt: 0.7, edge: 0.4, edgeW: 1.8 }, r);
    x.save();
    x.globalCompositeOperation = 'destination-out';
    wash(x, circle(cx - 18, cy - 26, 20, 16, 14), ['#000000'], { layers: 8, alpha: 0.035, amt: 0.8, edge: 0 }, r);
    x.restore();
    ink(x, place(SHAPES[s], cx + 2.5, cy - 2, 70), true, 1.7, SUITS[s].ink, r, 1.2);
    spatter(x, cx, cy, 105, 16, SUITS[s].wash[0], r, 2.6, 0.55);
  }

  function face(s, rank) {
    var c = mk(CW, CH), x = c.getContext('2d'), r = rng(9001 + s * 31 + rank * 7);
    roundRect(x, 0, 0, CW, CH, RAD);
    x.clip();
    // paint on a transparent layer so lifted blooms show the paper again
    var layer = mk(CW, CH), lx = layer.getContext('2d');
    if (rank === 1) ace(lx, s, r);
    else if (rank === 11) jack(lx, s, r);
    else if (rank === 12) queen(lx, s, r);
    else if (rank === 13) king(lx, s, r);
    else {
      var pts = PIPS[rank], bx = 74, by = 128, bw = CW - 148, bh = CH - 128 - 46;
      pts.forEach(function (p) { stamp(lx, s, bx + p[0] * bw, by + p[1] * bh, 64, p[1] > 0.5 ? Math.PI : 0, r); });
    }
    x.drawImage(cardPaper, 0, 0);
    x.drawImage(layer, 0, 0);
    // corner index: rank top-left, small painted suit top-right
    var label = RANKS[rank - 1];
    x.font = '700 ' + (label === '10' ? 74 : 84) + 'px ' + FONT;
    x.textBaseline = 'alphabetic';
    x.fillStyle = SUITS[s].ink;
    x.globalAlpha = 0.92;
    x.fillText(label, label === '10' ? 10 : 16, 76);
    x.globalAlpha = 0.35;
    x.fillText(label, (label === '10' ? 10 : 16) + 0.8, 76.6);
    x.globalAlpha = 1;
    stamp(x, s, CW - 40, 45, 66, 0, r);
    x.globalCompositeOperation = 'multiply';
    x.drawImage(cardGrain, 0, 0);
    x.globalCompositeOperation = 'source-over';
    roundRect(x, 1, 1, CW - 2, CH - 2, RAD - 1);
    x.strokeStyle = 'rgba(140,118,70,.35)';
    x.lineWidth = 2;
    x.stroke();
    return c;
  }

  // ---------- card backs ----------
  var BACKS = {
    night: function (p, r) {
      var m = 12;
      wash(p, rect(m, m, CW - 2 * m, CH - 2 * m, 24), ['#2b3470', '#3e4c94'], { layers: 32, alpha: 0.08, amt: 0.28, edge: 0.3 }, r);
      wash(p, rect(m, CH * 0.58, CW - 2 * m, CH * 0.42 - m, 24), ['#5a3d86', '#2b3470'], { layers: 18, alpha: 0.06, amt: 0.4, edge: 0 }, r);
      for (var i = 0; i < 5; i++) wash(p, circle(30 + r() * 190, 40 + r() * 270, 18 + r() * 24, 18 + r() * 20, 12), ['#8396d4'], { layers: 10, alpha: 0.03, amt: 0.5, edge: 0.05 }, r);
      lift(p, circle(125, 150, 46, 46, 18), r, 0.2);
      wash(p, circle(125, 150, 40, 40, 30), ['#f2d374', '#f7e6a6'], { layers: 26, alpha: 0.08, amt: 0.4, edge: 0.3 }, r);
      wash(p, circle(110, 140, 10, 8, 14), ['#e0b44d'], { layers: 8, alpha: 0.06, amt: 0.6, edge: 0.1 }, r);
      wash(p, circle(140, 168, 7, 6, 12), ['#e0b44d'], { layers: 8, alpha: 0.06, amt: 0.6, edge: 0.1 }, r);
      p.globalCompositeOperation = 'destination-out';
      spatter(p, 125, 175, 160, 70, '#000000', r, 1.6, 0.9);
      p.globalCompositeOperation = 'source-over';
      spatter(p, 125, 175, 150, 18, '#fbe9a8', r, 1.4, 0.8);
    },
    meadow: function (p, r) {
      var m = 12, i;
      wash(p, rect(m, m, CW - 2 * m, CH * 0.62, 24), ['#8dbad6', '#b9d6e2'], { layers: 26, alpha: 0.06, amt: 0.3, edge: 0.15 }, r);
      lift(p, circle(178, 86, 32, 32, 16), r, 0.25);
      wash(p, circle(178, 86, 26, 26, 26), ['#f3c34a', '#f7da7a'], { layers: 24, alpha: 0.09, amt: 0.4, edge: 0.35 }, r);
      var hill = [{ x: m, y: CH - m }];
      for (i = 0; i <= 12; i++) hill.push({ x: m + i / 12 * (CW - 2 * m), y: CH * 0.52 + Math.sin(i / 12 * Math.PI * 1.3 + 0.6) * 22 });
      hill.push({ x: CW - m, y: CH - m });
      wash(p, densify(hill, 20), ['#7fae5a', '#9cc06a'], { layers: 22, alpha: 0.07, amt: 0.35, edge: 0.2 }, r);
      var hill2 = [{ x: m, y: CH - m }];
      for (i = 0; i <= 12; i++) hill2.push({ x: m + i / 12 * (CW - 2 * m), y: CH * 0.66 + Math.sin(i / 12 * Math.PI * 1.6 + 2.2) * 18 });
      hill2.push({ x: CW - m, y: CH - m });
      wash(p, densify(hill2, 20), ['#3f7a43', '#5d9748'], { layers: 24, alpha: 0.08, amt: 0.35, edge: 0.25 }, r);
      for (i = 0; i < 26; i++) {
        var gx = m + 6 + r() * (CW - 2 * m - 12), gy = CH * 0.6 + r() * (CH * 0.38 - m);
        ink(p, [{ x: gx, y: gy }, { x: gx + (r() - 0.5) * 6, y: gy - 6 - r() * 8 }], false, 1, 'rgba(30,70,40,.8)', r, 0.4);
      }
      p.globalCompositeOperation = 'destination-out';
      spatter(p, 125, 270, 80, 34, '#000000', r, 2.6, 0.9);
      p.globalCompositeOperation = 'source-over';
      spatter(p, 125, 270, 85, 16, '#f2c24b', r, 2.4, 0.9);
      spatter(p, 125, 280, 85, 12, '#e2627c', r, 2.2, 0.85);
      spatter(p, 125, 60, 90, 6, '#ffffff', r, 1, 0.3);
    },
    sunset: function (p, r) {
      var m = 12, i;
      wash(p, rect(m, m, CW - 2 * m, CH - 2 * m, 24), ['#f2b35a', '#f6cf6e'], { layers: 26, alpha: 0.07, amt: 0.28, edge: 0.2 }, r);
      wash(p, rect(m, m, CW - 2 * m, CH * 0.36, 24), ['#e3708a', '#ee8d6c'], { layers: 22, alpha: 0.07, amt: 0.4, edge: 0 }, r);
      lift(p, circle(125, 190, 50, 50, 18), r, 0.15);
      wash(p, circle(125, 190, 44, 44, 30), ['#e14f3a', '#ea6a3f'], { layers: 26, alpha: 0.09, amt: 0.35, edge: 0.35 }, r);
      wash(p, rect(m, CH * 0.64, CW - 2 * m, CH * 0.36 - m, 24), ['#36438a', '#5b6496'], { layers: 26, alpha: 0.08, amt: 0.3, edge: 0.3 }, r);
      p.globalCompositeOperation = 'destination-out';
      for (i = 0; i < 9; i++) {
        var y = CH * 0.68 + i * 10, w = 50 - i * 3 + r() * 14;
        p.fillStyle = 'rgba(0,0,0,' + (0.45 + r() * 0.3) + ')';
        p.fillRect(125 - w / 2 + (r() - 0.5) * 10, y, w, 2 + r() * 2);
      }
      p.globalCompositeOperation = 'source-over';
      for (i = 0; i < 9; i++) {
        var yy = CH * 0.68 + i * 10, ww = 40 - i * 3 + r() * 10;
        p.fillStyle = 'rgba(234,106,63,' + (0.3 + r() * 0.3) + ')';
        p.fillRect(125 - ww / 2 + (r() - 0.5) * 10, yy, ww, 2);
      }
      [[70, 90, 9], [92, 76, 7], [176, 110, 8]].forEach(function (b) {
        ink(p, [{ x: b[0] - b[2], y: b[1] - 3 }, { x: b[0] - b[2] / 2, y: b[1] - 5 }, { x: b[0], y: b[1] }, { x: b[0] + b[2] / 2, y: b[1] - 5 }, { x: b[0] + b[2], y: b[1] - 3 }], false, 1.4, 'rgba(60,40,70,.85)', r, 0.3);
      });
    }
  };
  function lift(p, pts, r, alpha) { // lift pigment off the paper with a damp brush
    p.globalCompositeOperation = 'destination-out';
    wash(p, pts, ['#000000'], { layers: 10, alpha: alpha, amt: 0.3, edge: 0 }, r);
    p.globalCompositeOperation = 'source-over';
  }
  function back(kind) {
    var c = mk(CW, CH), x = c.getContext('2d'), r = rng(kind.length * 101 + 7);
    roundRect(x, 0, 0, CW, CH, RAD);
    x.clip();
    var layer = mk(CW, CH), lx = layer.getContext('2d');
    BACKS[kind](lx, r);
    x.drawImage(cardPaper, 0, 0);
    x.drawImage(layer, 0, 0);
    // a thin border of bare paper, as if masked with tape
    x.strokeStyle = 'rgba(251,247,234,.75)';
    x.lineWidth = 2.5;
    roundRect(x, 21, 21, CW - 42, CH - 42, 10);
    x.stroke();
    x.globalCompositeOperation = 'multiply';
    x.drawImage(cardGrain, 0, 0);
    x.globalCompositeOperation = 'source-over';
    roundRect(x, 1, 1, CW - 2, CH - 2, RAD - 1);
    x.strokeStyle = 'rgba(140,118,70,.35)';
    x.lineWidth = 2;
    x.stroke();
    return c;
  }

  // ---------- table ----------
  var TABLES = {
    paper: { base: [244, 236, 212], washes: ['#e6d29c', '#d8bf86', '#cbd9b8', '#e8c9a8', '#c9d4e2'] },
    sage: { base: [228, 234, 214], washes: ['#a3c295', '#8db08a', '#c2d5a0', '#7fa398', '#b9cfb0'] },
    dusk: { base: [229, 230, 240], washes: ['#9fb1d6', '#b4a5cf', '#8aa2c4', '#c9b6d9', '#a9c3d6'] }
  };
  function table(kind) {
    var T = TABLES[kind] || TABLES.paper, W = 1400, H = 900;
    var c = paper(W, H, T.base, 5, 1.3), x = c.getContext('2d'), r = rng(kind.length * 977);
    for (var i = 0; i < 11; i++) {
      var col = T.washes[i % T.washes.length];
      wash(x, circle(r() * W, r() * H, 160 + r() * 260, 140 + r() * 220, 12, r() * 3), [col, T.washes[(i + 2) % T.washes.length]], { layers: 22, alpha: 0.03, amt: 0.9, spread: 3, edge: 0.07, edgeW: 2 }, r);
    }
    var v = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
    v.addColorStop(0, 'rgba(90,70,40,0)');
    v.addColorStop(1, 'rgba(90,70,40,.16)');
    x.fillStyle = v;
    x.fillRect(0, 0, W, H);
    return c;
  }

  // ---------- splash (a watercolor bloom when a card lands on a foundation) ----------
  function splash(s) {
    var S = 200, c = mk(S, S), x = c.getContext('2d'), r = rng(300 + s);
    wash(x, circle(S / 2, S / 2, 70, 70, 16), [light(SUITS[s].wash[0], 0.2), light(SUITS[s].wash[1], 0.4)], { layers: 18, alpha: 0.05, amt: 0.9, spread: 3, edge: 0.5, edgeW: 2.5 }, r);
    spatter(x, S / 2, S / 2, 95, 26, SUITS[s].wash[0], r, 3, 0.6);
    return c.toDataURL();
  }

  function nextFrame() { return new Promise(function (res) { (window.requestAnimationFrame || setTimeout)(function () { res(); }); }); }

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var t = new Promise(function (res) { setTimeout(res, 2500); });
    return Promise.race([Promise.all([document.fonts.load('700 80px "Caveat"', 'AJQK10'), document.fonts.ready]), t]).catch(function () {});
  }

  // Paints everything; onProgress(0..1) lets the page show a loading bar.
  function init(onProgress) {
    var out = { faces: [], backs: {}, splash: [] };
    return fontsReady().then(function () {
      cardPaper = paper(CW, CH, PAPER, 11, 1);
      cardGrain = grain(CW, CH, 12);
      for (var s = 0; s < 4; s++) {
        pipStamps[s] = [];
        for (var v = 0; v < 5; v++) pipStamps[s].push(makePip(s, 50 + s * 10 + v));
      }
      var jobs = [];
      for (var id = 0; id < 52; id++) jobs.push(id);
      var total = jobs.length + 3, done = 0;
      function step() {
        var t0 = performance.now();
        while (jobs.length && performance.now() - t0 < 30) {
          var cid = jobs.shift();
          out.faces[cid] = face(Math.floor(cid / 13), cid % 13 + 1);
          done++;
        }
        if (onProgress) onProgress(done / total);
        if (jobs.length) return nextFrame().then(step);
        return nextFrame().then(function () {
          ['night', 'meadow', 'sunset'].forEach(function (k) { out.backs[k] = back(k); });
          for (var s2 = 0; s2 < 4; s2++) out.splash.push(splash(s2));
          if (onProgress) onProgress(1);
          return out;
        });
      }
      return step();
    });
  }

  window.Watercolor = { init: init, table: table, CW: CW, CH: CH };
})();
