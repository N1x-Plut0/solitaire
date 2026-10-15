/* Watercolor painter.
   Paint is simulated, not faked with transparency:
   - every sheet is cold-press paper with a height map, lit from the top left;
   - pigment is stored as optical density per channel and composited like glazes
     (color = paper * exp(-density)), so a blue wash over a yellow one turns green;
   - each wash darkens at its rim where pigment settles as it dries, varies in strength
     with a low-frequency "wetness" field, granulates into the paper valleys,
     and can grow backruns (cauliflower blooms) and bleed into a second pigment;
   - lifting with a damp brush, masking tape, masking fluid and salt are supported.
   Everything is seeded, so the deck looks the same on every visit. */
(function () {
  'use strict';

  var CW = 250, CH = 350, RAD = 18;
  var FONT = '"Caveat", "Segoe Print", "Comic Sans MS", cursive';
  var CARD_PAPER = [251, 248, 238];
  var GRAPHITE = '#5d5d66', SEPIA = '#5b3f2a';

  // Spades and clubs are cool "dark" suits, hearts and diamonds are warm "red" ones.
  var SUITS = [
    { wash: ['#22348f', '#55308c'], bg: ['#2f7fc0', '#6a3f9a'], ink: '#1d255c' },
    { wash: ['#c11a3a', '#e0457a'], bg: ['#d83a6a', '#d0902a'], ink: '#9c1230' },
    { wash: ['#df4419', '#f2971c'], bg: ['#e0702a', '#e8b030'], ink: '#ad300c' },
    { wash: ['#0f6b55', '#1f7d96'], bg: ['#4f8f2f', '#2f86b0'], ink: '#0f3a2e' }
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
  function absorb(h) { return hex(h).map(function (v) { return -Math.log(Math.max(v, 4) / 255); }); }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function tracePoly(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    for (var i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
    ctx.closePath();
  }
  // Split every edge and push the new point off in a random direction (Tyler Hobbs' watercolor polygons).
  function deform(pts, depth, amt, r) {
    var p = pts;
    for (var d = 0; d < depth; d++) {
      var out = [];
      for (var i = 0; i < p.length; i++) {
        var a = p[i], b = p[(i + 1) % p.length], av = a.v || 1, bv = b.v || 1;
        out.push(a);
        var len = Math.hypot(b.x - a.x, b.y - a.y), v = (av + bv) / 2;
        var g = gauss(r) * len * amt * v, ang = r() * Math.PI * 2;
        out.push({ x: (a.x + b.x) / 2 + Math.cos(ang) * g, y: (a.y + b.y) / 2 + Math.sin(ang) * g, v: v * (0.8 + r() * 0.4) });
      }
      p = out;
    }
    return p;
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
  function densify(pts, step, open) {
    var out = [], n = open ? pts.length - 1 : pts.length;
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var k = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (var j = 0; j < k; j++) out.push({ x: a.x + (b.x - a.x) * j / k, y: a.y + (b.y - a.y) * j / k });
    }
    if (open) out.push(pts[pts.length - 1]);
    return out;
  }
  function rect(x, y, w, h, step) {
    return densify([{ x: x, y: y }, { x: x + w, y: y }, { x: x + w, y: y + h }, { x: x, y: y + h }], step || 8);
  }
  function roundRectPts(x, y, w, h, rr, step) {
    var p = [], corners = [[x + w - rr, y + rr, -Math.PI / 2], [x + w - rr, y + h - rr, 0], [x + rr, y + h - rr, Math.PI / 2], [x + rr, y + rr, Math.PI]];
    corners.forEach(function (c) { for (var i = 0; i <= 6; i++) { var a = c[2] + i / 6 * Math.PI / 2; p.push({ x: c[0] + Math.cos(a) * rr, y: c[1] + Math.sin(a) * rr }); } });
    return densify(p, step || 6);
  }
  function leaf(x0, y0, x1, y1, w, n) {
    var pts = [], dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len, i, t, hw;
    n = n || 16;
    for (i = 0; i <= n; i++) { t = i / n; hw = Math.pow(Math.sin(Math.PI * t), 0.8) * w; pts.push({ x: x0 + dx * t + nx * hw, y: y0 + dy * t + ny * hw }); }
    for (i = n - 1; i > 0; i--) { t = i / n; hw = Math.pow(Math.sin(Math.PI * t), 0.8) * w; pts.push({ x: x0 + dx * t - nx * hw, y: y0 + dy * t - ny * hw }); }
    return pts;
  }
  function arch(x0, y0, x1, y1) {
    var pts = [{ x: x0, y: y1 }], cx = (x0 + x1) / 2, rx = (x1 - x0) / 2;
    for (var i = 0; i <= 18; i++) { var a = Math.PI + i / 18 * Math.PI; pts.push({ x: cx + Math.cos(a) * rx, y: y0 + rx + Math.sin(a) * rx }); }
    pts.push({ x: x1, y: y1 });
    return densify(pts, 7);
  }
  function bounds(polys, pad) {
    var b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    polys.forEach(function (p) { p.forEach(function (q) {
      if (q.x < b.x0) b.x0 = q.x; if (q.y < b.y0) b.y0 = q.y;
      if (q.x > b.x1) b.x1 = q.x; if (q.y > b.y1) b.y1 = q.y;
    }); });
    b.x0 -= pad; b.y0 -= pad; b.x1 += pad; b.y1 += pad;
    return b;
  }

  // Separable box blur, run twice (close to a gaussian). Edges are clamped.
  function blur(src, w, h, r) {
    r = Math.round(r);
    if (r < 1) return src;
    var a = new Float32Array(src), b = new Float32Array(w * h), inv = 1 / (r + r + 1), x, y, o, acc, j;
    for (var pass = 0; pass < 2; pass++) {
      for (y = 0; y < h; y++) {
        o = y * w; acc = (r + 1) * a[o];
        for (j = 0; j < r; j++) acc += a[o + Math.min(j, w - 1)];
        for (x = 0; x < w; x++) {
          acc += a[o + Math.min(x + r, w - 1)] - a[o + Math.max(x - r - 1, 0)];
          b[o + x] = acc * inv;
        }
      }
      for (x = 0; x < w; x++) {
        acc = (r + 1) * b[x];
        for (j = 0; j < r; j++) acc += b[Math.min(j, h - 1) * w + x];
        for (y = 0; y < h; y++) {
          acc += b[Math.min(y + r, h - 1) * w + x] - b[Math.max(y - r - 1, 0) * w + x];
          a[y * w + x] = acc * inv;
        }
      }
    }
    return a;
  }

  // Smooth value noise in 0..1.
  function vnoise(w, h, scale, r) {
    var gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2, g = new Float32Array(gw * gh), out = new Float32Array(w * h);
    for (var i = 0; i < g.length; i++) g[i] = r();
    for (var y = 0; y < h; y++) {
      var gy = y / scale, y0 = gy | 0, fy = gy - y0;
      fy = fy * fy * (3 - 2 * fy);
      for (var x = 0; x < w; x++) {
        var gx = x / scale, x0 = gx | 0, fx = gx - x0;
        fx = fx * fx * (3 - 2 * fx);
        var k = y0 * gw + x0;
        var top = g[k] + (g[k + 1] - g[k]) * fx, bot = g[k + gw] + (g[k + gw + 1] - g[k + gw]) * fx;
        out[y * w + x] = top + (bot - top) * fy;
      }
    }
    return out;
  }

  // ---------- paper ----------
  // H: height of the paper tooth, S: lighting from the top left, NA/NB: wetness and mixing fields.
  var texCache = {};
  function Tex(w, h, seed, tooth) {
    var key = w + 'x' + h + ':' + seed;
    if (texCache[key]) return texCache[key];
    var r = rng(seed), n = w * h, i;
    var a = vnoise(w, h, 2.3, r), b = vnoise(w, h, 5.5, r), c = vnoise(w, h, 13, r), d = vnoise(w, h, 34, r);
    var H = new Float32Array(n), S = new Float32Array(n);
    for (i = 0; i < n; i++) H[i] = clamp((0.12 * a[i] + 0.33 * b[i] + 0.33 * c[i] + 0.22 * d[i] - 0.5) * 1.8 + 0.5, 0, 1);
    tooth = tooth == null ? 1 : tooth;
    for (i = 0; i < n; i++) {
      var p = H[i - w - 1] !== undefined ? H[i - w - 1] : H[i], q = H[i + w + 1] !== undefined ? H[i + w + 1] : H[i];
      S[i] = 1 + ((p - q) * 0.11 + (H[i] - 0.5) * 0.035) * tooth;
    }
    // several noises on grids that never line up, so no square pattern shows
    var na = vnoise(w, h, 47, r), nb = vnoise(w, h, 29.3, r), nc = vnoise(w, h, 113, r), nd = vnoise(w, h, 21.7, r), ne = vnoise(w, h, 13.1, r);
    var NA = new Float32Array(n), NB = new Float32Array(n);
    for (i = 0; i < n; i++) {
      NA[i] = clamp((na[i] * 0.4 + nb[i] * 0.25 + nc[i] * 0.35 - 0.5) * 1.5 + 0.5, 0, 1);
      NB[i] = clamp((nd[i] * 0.6 + ne[i] * 0.4 - 0.5) * 1.5 + 0.5, 0, 1);
    }
    var t = { w: w, h: h, H: H, S: S, NA: NA, NB: NB };
    texCache[key] = t;
    return t;
  }

  // ---------- a sheet you can paint on ----------
  function Sheet(tex, seed) {
    this.t = tex; this.w = tex.w; this.h = tex.h;
    var n = this.w * this.h;
    this.A = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
    this.r = rng(seed);
    this.cv = mk(this.w, this.h);
    this.cx = this.cv.getContext('2d', { willReadFrequently: true });
  }

  // Draw a shape on the scratch canvas and read it back as a 0..1 mask.
  Sheet.prototype.raster = function (bb, draw) {
    var x0 = Math.max(0, Math.floor(bb.x0)), y0 = Math.max(0, Math.floor(bb.y0));
    var x1 = Math.min(this.w, Math.ceil(bb.x1)), y1 = Math.min(this.h, Math.ceil(bb.y1));
    var w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return null;
    var ctx = this.cx;
    ctx.clearRect(x0, y0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, w, h);
    ctx.clip();
    ctx.fillStyle = ctx.strokeStyle = '#000';
    draw(ctx);
    ctx.restore();
    var d = ctx.getImageData(x0, y0, w, h).data, M = new Float32Array(w * h);
    for (var k = 0; k < M.length; k++) M[k] = d[k * 4 + 3] / 255;
    return { x: x0, y: y0, w: w, h: h, M: M };
  };

  // Lay pigment into the sheet through a mask.
  Sheet.prototype.paint = function (R, pig, o) {
    var w = R.w, h = R.h, M = R.M, t = this.t, W = this.w, TH = this.h, r = this.r;
    if (o.soft) M = blur(M, w, h, o.soft);
    var edge = o.edge == null ? 1 : o.edge;
    var B = edge ? blur(M, w, h, o.edgeR || 3) : null;
    var a1 = absorb(pig), a2 = o.pig2 ? absorb(o.pig2) : null;
    var dens = o.density == null ? 0.8 : o.density;
    var noise = o.noise == null ? 0.35 : o.noise, gran = o.gran == null ? 0.45 : o.gran;
    var ox = Math.floor(r() * W), oy = Math.floor(r() * TH), ox2 = Math.floor(r() * W), oy2 = Math.floor(r() * TH);
    var blooms = [], i, k;
    for (i = 0; i < (o.blooms || 0); i++) {
      for (var tries = 0; tries < 30; tries++) {
        var bx = Math.floor(r() * w), by = Math.floor(r() * h);
        if (M[by * w + bx] > 0.6) { blooms.push({ x: bx, y: by, R: (o.bloomR || 12) * (0.6 + r() * 0.8), p: [r() * 6.3, r() * 6.3, r() * 6.3, r() * 6.3], k: [2 + Math.floor(r() * 2), 5 + Math.floor(r() * 3), 9 + Math.floor(r() * 4), 15 + Math.floor(r() * 6)] }); break; }
      }
    }
    var A0 = this.A[0], A1 = this.A[1], A2 = this.A[2], H = t.H, NA = t.NA, NB = t.NB, peaks = !!o.peaks;
    for (var y = 0; y < h; y++) {
      var gy = y + R.y, ny = ((gy + oy) % TH) * W, ny2 = ((gy + oy2) % TH) * W;
      for (var x = 0; x < w; x++) {
        k = y * w + x;
        var m = M[k];
        if (m < 0.003) continue;
        var gx = x + R.x, gi = gy * W + gx;
        var D = m;
        if (edge) { var rim = m - B[k]; if (rim > 0) D *= 1 + edge * rim * 3.2; }
        D *= 1 - noise + 2 * noise * NA[ny + (gx + ox) % W];
        var hh = H[gi];
        D *= 1 + gran * ((peaks ? hh : 1 - hh) - 0.5) * 1.1;
        for (i = 0; i < blooms.length; i++) {
          var bl = blooms[i], dx = x - bl.x, dy = y - bl.y, dd = Math.sqrt(dx * dx + dy * dy);
          if (dd > bl.R * 1.6) continue;
          var th = Math.atan2(dy, dx);
          var Rb = bl.R * (1 + 0.16 * Math.sin(th * bl.k[0] + bl.p[0]) + 0.09 * Math.sin(th * bl.k[1] + bl.p[1]) + 0.05 * Math.sin(th * bl.k[2] + bl.p[2]) + 0.03 * Math.sin(th * bl.k[3] + bl.p[3]));
          if (dd < Rb) { var f = dd / Rb; D *= 0.5 + 0.5 * f * f; }
          var ring = (dd - Rb) / 1.6;
          D *= 1 + 0.55 * Math.exp(-ring * ring);
        }
        D *= dens;
        if (D <= 0) continue;
        if (a2) {
          var tm = clamp((NB[ny2 + (gx + ox2) % W] - 0.5) * 2.2 + 0.5, 0, 1);
          A0[gi] += D * (a1[0] + (a2[0] - a1[0]) * tm);
          A1[gi] += D * (a1[1] + (a2[1] - a1[1]) * tm);
          A2[gi] += D * (a1[2] + (a2[2] - a1[2]) * tm);
        } else {
          A0[gi] += D * a1[0]; A1[gi] += D * a1[1]; A2[gi] += D * a1[2];
        }
      }
    }
    return this;
  };

  function layered(polys, o, r) {
    var amt = o.amt == null ? 0.4 : o.amt, layers = o.layers || 5;
    return function (ctx) {
      if (!amt) { polys.forEach(function (p) { tracePoly(ctx, p); ctx.fill(); }); return; }
      ctx.globalAlpha = 1 - Math.pow(0.07, 1 / layers);
      polys.forEach(function (p) {
        var base = deform(p, 1, amt * 0.6, r);
        for (var l = 0; l < layers; l++) { tracePoly(ctx, deform(base, 2, amt, r)); ctx.fill(); }
      });
      ctx.globalAlpha = 1;
    };
  }
  Sheet.prototype.wash = function (polys, pig, o) {
    o = o || {};
    var b0 = bounds(polys, 0), ext = Math.max(b0.x1 - b0.x0, b0.y1 - b0.y0);
    var pad = 6 + (o.soft || 0) * 3 + (o.edgeR || 3) * 2 + (o.amt == null ? 0.4 : o.amt) * (10 + ext * 0.3);
    var R = this.raster(bounds(polys, pad), layered(polys, o, this.r));
    if (R) this.paint(R, pig, o);
    return this;
  };
  Sheet.prototype.text = function (str, x, y, size, pig, o) {
    o = o || {};
    var font = (o.weight || 700) + ' ' + size + 'px ' + FONT, ctx = this.cx;
    ctx.font = font;
    var w = ctx.measureText(str).width, left = o.align === 'center' ? x - w / 2 : x;
    var R = this.raster({ x0: left - 14, y0: y - size * 1.05, x1: left + w + 14, y1: y + size * 0.4 }, function (c) {
      c.font = font;
      c.textBaseline = 'alphabetic';
      c.fillText(str, left, y);
    });
    if (R) this.paint(R, pig, o);
    return this;
  };
  Sheet.prototype.line = function (pts, pig, o) {
    o = o || {};
    var r = this.r, wd = o.width || 1.2, jit = o.jitter == null ? 0.6 : o.jitter;
    var R = this.raster(bounds([pts], wd * 2 + 4), function (c) {
      c.lineWidth = wd;
      c.lineCap = c.lineJoin = 'round';
      c.beginPath();
      var pen = false;
      for (var i = 0; i < pts.length + (o.closed ? 1 : 0); i++) {
        var p = pts[i % pts.length], x = p.x + (r() - 0.5) * jit, y = p.y + (r() - 0.5) * jit;
        if (o.broken && r() < o.broken) { pen = false; continue; }
        if (pen) c.lineTo(x, y); else c.moveTo(x, y);
        pen = true;
      }
      c.stroke();
    });
    if (R) this.paint(R, pig, Object.assign({ edge: 0, noise: 0.3, gran: 0.6, density: 0.5 }, o));
    return this;
  };
  // Drops: [{x, y, s}] as little round splashes.
  Sheet.prototype.drops = function (list, pig, o) {
    if (!list.length) return this;
    var self = this, polys = list.map(function (d) { return circle(d.x, d.y, d.s, d.s * (0.85 + self.r() * 0.3), Math.max(8, Math.round(d.s * 3))); });
    return this.wash(polys, pig, Object.assign({ amt: 0.15, layers: 2, edge: 1.4, edgeR: 1, density: 0.8, gran: 0.4 }, o));
  };
  // Lift pigment off with a damp brush (amount 1 = back to bare paper).
  Sheet.prototype.lift = function (polys, amount, o) {
    o = o || {};
    var R = this.raster(bounds(polys, 6 + (o.soft || 0) * 3), layered(polys, o, this.r));
    if (!R) return this;
    var M = o.soft ? blur(R.M, R.w, R.h, o.soft) : R.M, A = this.A, W = this.w;
    for (var y = 0; y < R.h; y++) for (var x = 0; x < R.w; x++) {
      var m = M[y * R.w + x];
      if (m < 0.003) continue;
      var gi = (y + R.y) * W + x + R.x, f = 1 - amount * Math.min(1, m);
      A[0][gi] *= f; A[1][gi] *= f; A[2][gi] *= f;
    }
    return this;
  };
  // Salt sprinkled into a wet wash leaves pale starbursts.
  Sheet.prototype.salt = function (x0, y0, w, h, n, amount) {
    var r = this.r, polys = [];
    for (var i = 0; i < n; i++) {
      var cx = x0 + r() * w, cy = y0 + r() * h, rr = 1.5 + r() * r() * 6, p = [];
      for (var j = 0; j < 14; j++) { var a = j / 14 * Math.PI * 2, s = rr * (j % 2 ? 0.45 + r() * 0.3 : 1 + r() * 0.6); p.push({ x: cx + Math.cos(a) * s, y: cy + Math.sin(a) * s }); }
      polys.push(p);
    }
    return this.lift(polys, amount, { amt: 0, soft: 1 });
  };
  // Masking tape: nothing outside the rectangle was ever painted.
  Sheet.prototype.tape = function (m) {
    var W = this.w, H = this.h, A = this.A;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (x >= m && x < W - m && y >= m && y < H - m) continue;
      var i = y * W + x;
      A[0][i] = A[1][i] = A[2][i] = 0;
    }
    return this;
  };
  // o.flat: white background without paper light (for images blended with "multiply").
  // o.deckle: torn, uneven edges with transparency.
  Sheet.prototype.canvas = function (o) {
    o = o || {};
    var w = this.w, h = this.h, c = mk(w, h), x = c.getContext('2d'), img = x.createImageData(w, h), d = img.data;
    var P = o.paper || CARD_PAPER, S = this.t.S, A0 = this.A[0], A1 = this.A[1], A2 = this.A[2], NA = this.t.NA, NB = this.t.NB;
    for (var i = 0, k = 0; i < w * h; i++, k += 4) {
      var s = o.flat ? 1 : S[i];
      d[k] = P[0] * s * Math.exp(-A0[i]);
      d[k + 1] = P[1] * s * Math.exp(-A1[i]);
      d[k + 2] = P[2] * s * Math.exp(-A2[i]);
      var al = 255;
      if (o.deckle) {
        var px = i % w, py = (i / w) | 0, dist = Math.min(px, py, w - 1 - px, h - 1 - py);
        var edge = o.deckle * (0.35 + 0.65 * NB[i] * 0.6 + NA[i] * 0.4) + 1;
        al = clamp((dist - edge) / 1.6, 0, 1) * 255;
      }
      d[k + 3] = al;
    }
    x.putImageData(img, 0, 0);
    return c;
  };

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

  // ---------- cards ----------
  var cardTex;
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

  function pip(S, s, x, y, sc, rot, o) {
    var su = SUITS[s], r = S.r;
    S.wash([place(SHAPES[s], x, y, sc, rot + (r() - 0.5) * 0.1)], su.wash[0], Object.assign({
      pig2: su.wash[1], density: 0.92, edge: 1.1, edgeR: Math.max(2, sc / 9), noise: 0.32, gran: 0.55,
      amt: 0.6, layers: 4, blooms: r() < 0.3 ? 1 : 0, bloomR: sc * 0.3
    }, o || {}));
    // a highlight lifted with a damp brush
    S.lift([circle(x - sc * 0.22, y - sc * 0.28, sc * 0.22, sc * 0.16, 10, -0.5)], 0.32, { soft: Math.max(2, sc / 9), amt: 0.4, layers: 3 });
  }
  function scatter(S, cx, cy, rad, n, maxS) {
    var r = S.r, out = [];
    for (var i = 0; i < n; i++) {
      var a = r() * Math.PI * 2, d = rad * Math.sqrt(r());
      out.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, s: 0.7 + r() * r() * maxS });
    }
    return out;
  }
  function vignette(S, s) {
    var su = SUITS[s], a = arch(26, 96, CW - 26, CH - 18);
    S.wash([a], su.bg[0], { pig2: su.bg[1], density: 0.17, soft: 2, edge: 1.4, edgeR: 6, noise: 0.5, gran: 0.45, amt: 0.25, layers: 3, blooms: 2, bloomR: 26 });
    S.line(a, GRAPHITE, { width: 1.1, density: 0.45, broken: 0.18, peaks: true, gran: 0.8 });
  }

  function king(S, s) {
    var su = SUITS[s], r = S.r, cx = CW / 2, i;
    vignette(S, s);
    // laurel wreath around the suit
    var wy = 252, wr = 60;
    [-1, 1].forEach(function (side) {
      var arc = [];
      for (i = 0; i <= 12; i++) {
        var a = Math.PI / 2 + side * (0.35 + i / 12 * 2.1);
        arc.push({ x: cx + Math.cos(a) * wr, y: wy + Math.sin(a) * wr * 0.95 });
      }
      S.line(arc, SEPIA, { width: 1.6, density: 0.55, jitter: 0.4 });
      for (i = 1; i <= 11; i++) {
        var aa = Math.PI / 2 + side * (0.35 + i / 12 * 2.1), px = cx + Math.cos(aa) * wr, py = wy + Math.sin(aa) * wr * 0.95;
        var tang = aa + side * Math.PI / 2, out = (i % 2 ? 0.55 : -0.55);
        var ang = tang + out, len = 17 + r() * 5;
        S.wash([leaf(px, py, px + Math.cos(ang) * len, py + Math.sin(ang) * len, 4.5, 8)], '#4f8a2e', { pig2: '#9a9a26', density: 0.75, edge: 1.2, edgeR: 2, amt: 0.3, layers: 3, gran: 0.5 });
      }
    });
    pip(S, s, cx, wy, 34, 0);
    // crown
    var cy = 152;
    var crown = [[-1, .5], [-1.12, -.6], [-.55, -.05], [0, -.82], [.55, -.05], [1.12, -.6], [1, .5]].map(function (p) { return { x: cx + p[0] * 54, y: cy + p[1] * 50 }; });
    S.wash([densify(crown, 4)], '#d8961f', { pig2: '#b94e1e', density: 0.75, edge: 1.3, edgeR: 3, noise: 0.45, gran: 0.6, amt: 0.35, layers: 4, blooms: 1, bloomR: 12 });
    S.lift([circle(cx - 18, cy - 4, 14, 8, 10)], 0.35, { soft: 3 });
    S.wash([rect(cx - 56, cy + 22, 112, 17, 5)], su.wash[0], { pig2: su.wash[1], density: 0.8, edge: 1.2, edgeR: 2, amt: 0.3, layers: 3 });
    [[-1.12, -.6], [0, -.82], [1.12, -.6]].forEach(function (p) {
      S.wash([circle(cx + p[0] * 54, cy + p[1] * 50 - 6, 7.5, 7.5, 14)], su.wash[1], { pig2: su.wash[0], density: 0.9, edge: 1.4, edgeR: 2, amt: 0.3, layers: 3 });
    });
    for (i = -2; i <= 2; i++) S.drops([{ x: cx + i * 21, y: cy + 30.5, s: 2.6 }], i % 2 ? '#e8b030' : '#f4f0e0', { density: 0.9 });
    S.line(densify(crown, 6), SEPIA, { width: 1.3, density: 0.7, broken: 0.25, closed: true });
    S.line(rect(cx - 56, cy + 22, 112, 17, 8), SEPIA, { width: 1.1, density: 0.6, broken: 0.3, closed: true });
  }

  function queen(S, s) {
    var su = SUITS[s], r = S.r, cx = CW / 2, cy = 168, i;
    vignette(S, s);
    S.line([{ x: cx, y: cy + 30 }, { x: cx - 5, y: cy + 70 }, { x: cx + 3, y: cy + 110 }, { x: cx, y: cy + 138 }], '#3f6e2a', { width: 3, density: 0.75, jitter: 0.3, edge: 0.8 });
    [[-1, 246, 0.82], [1, 226, 0.18], [-1, 286, 0.9]].forEach(function (l) {
      var ang = Math.PI * l[2], len = 44 + r() * 14;
      S.wash([leaf(cx, l[1], cx + Math.cos(ang) * len, l[1] - Math.sin(ang) * len * 0.5, 11)], '#4f8a2e', { pig2: '#2f7a5a', density: 0.75, edge: 1.3, edgeR: 3, amt: 0.3, layers: 3, blooms: 1, bloomR: 8 });
      S.line([{ x: cx, y: l[1] }, { x: cx + Math.cos(ang) * len * 0.9, y: l[1] - Math.sin(ang) * len * 0.45 }], '#2f5a26', { width: 1, density: 0.5 });
    });
    // petals glazed one over another, so overlaps get deeper
    for (i = 0; i < 8; i++) {
      var a = i / 8 * Math.PI * 2 + 0.2;
      S.wash([circle(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, 30, 18, 22, a)], su.wash[1], { pig2: su.wash[0], density: 0.32, edge: 1.5, edgeR: 3, amt: 0.35, layers: 3, noise: 0.45 });
    }
    for (i = 0; i < 5; i++) {
      var b = i / 5 * Math.PI * 2 - 0.4;
      S.wash([circle(cx + Math.cos(b) * 14, cy + Math.sin(b) * 14, 18, 12, 18, b)], su.wash[0], { pig2: su.wash[1], density: 0.42, edge: 1.5, edgeR: 2, amt: 0.35, layers: 3 });
    }
    S.wash([circle(cx, cy, 11, 11, 18)], '#d8961f', { pig2: '#b94e1e', density: 0.85, edge: 1.3, edgeR: 2, amt: 0.3, layers: 3 });
    S.drops(scatter(S, cx, cy, 9, 9, 1.4), SEPIA, { density: 0.8 });
    for (i = 0; i < 8; i += 2) {
      var c = i / 8 * Math.PI * 2 + 0.2;
      S.line(circle(cx + Math.cos(c) * 32, cy + Math.sin(c) * 32, 29, 17, 20, c), SEPIA, { width: 1, density: 0.5, broken: 0.45, closed: true });
    }
    pip(S, s, cx, 312, 15, 0);
  }

  function jack(S, s) {
    var su = SUITS[s], r = S.r, i;
    vignette(S, s);
    S.wash([leaf(98, 316, 150, 132, 16)], '#d8961f', { pig2: '#b94e1e', density: 0.45, edge: 1.3, edgeR: 3, amt: 0.3, layers: 3, blooms: 1, bloomR: 10 });
    var x0 = 66, y0 = 320, x1 = 184, y1 = 116;
    S.wash([leaf(x0 + 8, y0 - 14, x1, y1, 28, 20)], su.wash[0], { pig2: su.wash[1], density: 0.62, edge: 1.4, edgeR: 3, noise: 0.45, amt: 0.3, layers: 4, blooms: 2, bloomR: 12 });
    var dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
    S.line([{ x: x0, y: y0 }, { x: x0 + dx * 0.5, y: y0 + dy * 0.5 + 2 }, { x: x1, y: y1 }], SEPIA, { width: 1.8, density: 0.75, jitter: 0.3 });
    for (i = 2; i < 13; i++) {
      if (i === 6 || i === 10) continue;
      var tt = 0.08 + i / 14 * 0.85, hw = Math.pow(Math.sin(Math.PI * Math.min(1, tt * 1.05)), 0.8) * 25;
      var bx = x0 + dx * tt, by = y0 + dy * tt;
      [-1, 1].forEach(function (side) {
        S.line([{ x: bx, y: by }, { x: bx + nx * hw * side + dx / len * 9, y: by + ny * hw * side + dy / len * 9 }], SEPIA, { width: 0.8, density: 0.45, jitter: 0.3 });
      });
    }
    S.drops(scatter(S, 96, 176, 30, 10, 2.4), su.wash[0], { density: 0.7 });
    pip(S, s, 186, 296, 17, 0);
  }

  function ace(S, s) {
    var su = SUITS[s], r = S.r, cx = CW / 2, cy = 214;
    S.wash([circle(cx, cy, 98, 108, 14)], su.bg[0], { pig2: su.bg[1], density: 0.18, soft: 12, edge: 1.4, edgeR: 8, noise: 0.55, gran: 0.45, amt: 0.6, layers: 4, blooms: 2, bloomR: 24 });
    S.line(circle(cx, cy, 80, 80, 48), GRAPHITE, { width: 1, density: 0.35, broken: 0.3, closed: true, peaks: true });
    S.line([{ x: cx, y: cy - 98 }, { x: cx, y: cy + 98 }], GRAPHITE, { width: 0.9, density: 0.25, broken: 0.35, peaks: true });
    S.line([{ x: cx - 90, y: cy }, { x: cx + 90, y: cy }], GRAPHITE, { width: 0.9, density: 0.25, broken: 0.35, peaks: true });
    pip(S, s, cx, cy, 64, 0, { blooms: 2, bloomR: 15, edgeR: 4 });
    S.drops(scatter(S, cx, cy, 112, 16, 3), su.wash[0], { density: 0.75 });
  }

  function face(s, rank) {
    var S = new Sheet(cardTex, 1000 + s * 97 + rank * 13), su = SUITS[s], r = S.r;
    if (rank === 1) ace(S, s);
    else if (rank === 11) jack(S, s);
    else if (rank === 12) queen(S, s);
    else if (rank === 13) king(S, s);
    else {
      // a pale wet-in-wet bloom behind the pips, never in the same place twice
      var bx = 60 + r() * 130, by = 150 + r() * 120;
      S.wash([circle(bx, by, 70 + r() * 50, 80 + r() * 60, 12, r() * 3)], su.bg[0], { pig2: su.bg[1], density: 0.12, soft: 9, edge: 1.4, edgeR: 7, noise: 0.5, gran: 0.4, amt: 0.6, layers: 4, blooms: r() < 0.6 ? 1 : 0, bloomR: 22 });
      var bx0 = 74, by0 = 130, bw = CW - 148, bh = CH - 130 - 46;
      PIPS[rank].forEach(function (p) {
        pip(S, s, bx0 + p[0] * bw, by0 + p[1] * bh, 24 * (0.96 + r() * 0.08), p[1] > 0.5 ? Math.PI : 0);
      });
      S.drops(scatter(S, 125, 210, 120, 3 + Math.floor(r() * 5), 2.2), su.wash[0], { density: 0.6 });
    }
    // corner index painted with a brush: rank top-left, small suit top-right
    var label = RANKS[rank - 1];
    S.text(label, label === '10' ? 9 : 15, 76, label === '10' ? 74 : 84, su.ink, { pig2: su.wash[0], density: 1, edge: 0.9, edgeR: 2, noise: 0.25, gran: 0.4 });
    pip(S, s, CW - 38, 44, 21, 0, { blooms: 0 });
    return roundCard(S.canvas());
  }

  function roundCard(src) {
    var c = mk(CW, CH), x = c.getContext('2d');
    roundRect(x, 0, 0, CW, CH, RAD);
    x.save();
    x.clip();
    x.drawImage(src, 0, 0);
    x.restore();
    roundRect(x, 1, 1, CW - 2, CH - 2, RAD - 1);
    x.strokeStyle = 'rgba(150,128,90,.4)';
    x.lineWidth = 2;
    x.stroke();
    return c;
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

  // ---------- card backs: small paintings framed by masking tape ----------
  var M = 12;
  var BACKS = {
    night: function (S) {
      var r = S.r, inner = [rect(M, M, CW - 2 * M, CH - 2 * M, 6)];
      S.wash(inner, '#1e2c8c', { pig2: '#55288a', density: 1.0, amt: 0, edge: 1.3, edgeR: 5, noise: 0.45, gran: 0.6, blooms: 3, bloomR: 26 });
      S.wash([rect(M - 20, CH * 0.6, CW - 2 * M + 40, CH * 0.5, 10)], '#141a46', { density: 0.55, amt: 0, soft: 18, edge: 0, gran: 0.9 });
      S.salt(M, M, CW - 2 * M, CH - 2 * M, 45, 0.4);
      S.lift([circle(125, 138, 62, 62, 24)], 0.3, { soft: 14, amt: 0 });
      S.lift([circle(125, 138, 39, 39, 48)], 0.95, { soft: 1, amt: 0 });
      S.wash([circle(125, 138, 38, 38, 48)], '#f0be2a', { pig2: '#f5dc6a', density: 0.4, soft: 1, edge: 1.5, edgeR: 4, amt: 0.15, layers: 3, noise: 0.5 });
      S.wash([circle(112, 128, 9, 7, 14), circle(138, 152, 6, 5, 12), circle(132, 120, 4, 4, 10)], '#b98a2a', { density: 0.2, soft: 2, amt: 0.3, edge: 1, edgeR: 2 });
      var stars = scatter(S, 125, 175, 150, 26, 1.2);
      S.lift(stars.map(function (d) { return circle(d.x, d.y, d.s, d.s, 8); }), 1, { amt: 0 });
      S.tape(M);
    },
    meadow: function (S) {
      var r = S.r, i;
      S.wash([rect(M, M, CW - 2 * M, CH * 0.64, 6)], '#2f84c4', { pig2: '#6a9ad8', density: 0.6, amt: 0, edge: 1, edgeR: 4, noise: 0.6, gran: 0.6, blooms: 2, bloomR: 22 });
      S.lift([circle(70, 96, 40, 16, 12), circle(170, 150, 46, 15, 12), circle(96, 176, 30, 10, 10)], 0.75, { soft: 6, amt: 0.5, layers: 3 });
      S.lift([circle(182, 74, 25, 25, 40)], 0.95, { soft: 1, amt: 0 });
      S.wash([circle(182, 74, 24, 24, 40)], '#f2b51a', { pig2: '#f5d850', density: 0.65, soft: 1, edge: 1.5, edgeR: 3, amt: 0.15, layers: 3 });
      var far = [{ x: M, y: CH - M }];
      for (i = 0; i <= 14; i++) far.push({ x: M + i / 14 * (CW - 2 * M), y: CH * 0.5 + Math.sin(i / 14 * Math.PI * 1.4 + 0.6) * 20 });
      far.push({ x: CW - M, y: CH - M });
      S.wash([densify(far, 6)], '#3f7f92', { pig2: '#5a8a6a', density: 0.45, amt: 0.15, edge: 1.3, edgeR: 3, gran: 0.7 });
      var near = [{ x: M, y: CH - M }];
      for (i = 0; i <= 14; i++) near.push({ x: M + i / 14 * (CW - 2 * M), y: CH * 0.66 + Math.sin(i / 14 * Math.PI * 1.7 + 2.2) * 16 });
      near.push({ x: CW - M, y: CH - M });
      S.wash([densify(near, 6)], '#3f8a22', { pig2: '#b0a52a', density: 0.8, amt: 0.15, edge: 1.3, edgeR: 3, gran: 0.7, blooms: 2, bloomR: 18 });
      for (i = 0; i < 30; i++) {
        var gx = M + 6 + r() * (CW - 2 * M - 12), gy = CH * 0.62 + r() * (CH * 0.36 - M);
        S.line([{ x: gx, y: gy }, { x: gx + (r() - 0.5) * 6, y: gy - 6 - r() * 9 }], '#1f4a22', { width: 1, density: 0.7, jitter: 0.2 });
      }
      var fl = scatter(S, 125, 278, 90, 30, 2.2);
      S.lift(fl.map(function (d) { return circle(d.x, d.y, d.s + 0.6, d.s + 0.6, 8); }), 1, { amt: 0 });
      S.drops(fl.filter(function (d, k) { return k % 3; }), '#e2386a', { pig2: '#f2b51a', density: 0.85 });
      S.tape(M);
    },
    sunset: function (S) {
      var r = S.r, i;
      S.wash([rect(M, M, CW - 2 * M, CH - 2 * M, 6)], '#f2ae1a', { pig2: '#f2c84a', density: 0.6, amt: 0, edge: 1, edgeR: 4, noise: 0.5, gran: 0.5 });
      S.wash([rect(M - 30, M - 30, CW + 60, CH * 0.42, 10)], '#d8386a', { pig2: '#ea6a2a', density: 0.7, amt: 0, soft: 16, edge: 0, noise: 0.5, gran: 0.6 });
      S.lift([circle(125, 190, 46, 46, 48)], 0.9, { soft: 1, amt: 0 });
      S.wash([circle(125, 190, 44, 44, 48)], '#dd2f1e', { pig2: '#ea5a1e', density: 0.85, soft: 1, edge: 1.5, edgeR: 3, amt: 0.15, layers: 3, blooms: 1, bloomR: 14 });
      S.lift([rect(M, CH * 0.63, CW - 2 * M, CH * 0.37 - M, 6)], 0.85, { amt: 0 });
      S.wash([rect(M, CH * 0.63, CW - 2 * M, CH * 0.37 - M, 6)], '#1f3394', { pig2: '#4a2f8a', density: 0.85, amt: 0, edge: 1.3, edgeR: 4, gran: 0.6, blooms: 2, bloomR: 18 });
      var refl = [];
      for (i = 0; i < 10; i++) {
        var y = CH * 0.66 + i * 10, w = 52 - i * 3.5 + r() * 12, x = 125 - w / 2 + (r() - 0.5) * 10;
        refl.push(rect(x, y, w, 2.5 + r() * 2, 4));
      }
      S.lift(refl, 0.9, { amt: 0 });
      S.wash(refl, '#ea5a1e', { pig2: '#f2ae1a', density: 0.45, amt: 0, edge: 0.6, edgeR: 1 });
      [[66, 92, 9], [88, 78, 7], [178, 112, 8], [160, 70, 6]].forEach(function (b) {
        S.line([{ x: b[0] - b[2], y: b[1] - 3 }, { x: b[0] - b[2] / 2, y: b[1] - 5 }, { x: b[0], y: b[1] }, { x: b[0] + b[2] / 2, y: b[1] - 5 }, { x: b[0] + b[2], y: b[1] - 3 }], '#3a2a40', { width: 1.5, density: 0.85, jitter: 0.2 });
      });
      S.tape(M);
    }
  };
  function back(kind) {
    var S = new Sheet(cardTex, kind.length * 101 + 7);
    BACKS[kind](S);
    return roundCard(S.canvas());
  }

  // ---------- table ----------
  var TABLES = {
    paper: { paper: [246, 239, 222], pigs: [['#d39a2a', '#b5552a'], ['#6f9a3a', '#c9a23a'], ['#3f86b8', '#8a6aa8'], ['#d8706a', '#d39a2a']] },
    sage: { paper: [240, 243, 230], pigs: [['#4f8a2a', '#2f86b0'], ['#8aa030', '#3f7a6a'], ['#c9a23a', '#5d8f3a'], ['#2f7a6a', '#7aa8c8']] },
    dusk: { paper: [241, 239, 238], pigs: [['#3a4fa8', '#8a4a9a'], ['#d8507a', '#3f86b8'], ['#5a3f8a', '#2f7fc0'], ['#c06a9a', '#e0a040']] }
  };
  function table(kind) {
    var T = TABLES[kind] || TABLES.paper, W = 1200, H = 780, i;
    var S = new Sheet(Tex(W, H, 77, 1.3), kind.length * 977 + 3), r = S.r;
    for (i = 0; i < 6; i++) {
      var p = T.pigs[i % T.pigs.length];
      S.wash([circle(r() * W, r() * H, 170 + r() * 260, 130 + r() * 200, 14, r() * 3)], p[0], { pig2: p[1], density: 0.09 + r() * 0.06, soft: 16, edge: 1.6, edgeR: 10, noise: 0.55, gran: 0.6, amt: 0.6, layers: 4, blooms: 2, bloomR: 60 });
    }
    for (i = 0; i < 4; i++) {
      var q = T.pigs[(i + 1) % T.pigs.length];
      S.wash([circle(r() * W, r() * H, 90 + r() * 160, 70 + r() * 120, 28, r() * 3)], q[0], { pig2: q[1], density: 0.09, soft: 1, edge: 1.8, edgeR: 6, noise: 0.5, gran: 0.6, amt: 0.35, layers: 3, blooms: 1, bloomR: 40 });
    }
    for (i = 0; i < 3; i++) {
      var sp = T.pigs[i % T.pigs.length];
      S.drops(scatter(S, r() * W, r() * H, 90, 26, 4), sp[0], { density: 0.35 });
    }
    return S.canvas({ paper: T.paper });
  }

  // ---------- pieces of the interface (white images, blended with "multiply") ----------
  var SWATCH = {
    red: ['#c41f3c', '#e0702a'], blue: ['#2a3f9a', '#6b3f9a'], gold: ['#f2b51a', '#e0841a'],
    green: ['#3f8a2a', '#1f7d96'], violet: ['#6b3f9a', '#c0408a'], orange: ['#e0501a', '#f2b51a']
  };
  function swatch(key, seed) {
    var p = SWATCH[key], W = 240, H = 90;
    var S = new Sheet(Tex(W, H, 31), seed);
    var r = S.r, pts = [];
    for (var i = 0; i < 18; i++) {
      var a = i / 18 * Math.PI * 2, rx = 104 + (Math.abs(Math.cos(a)) > 0.9 ? r() * 10 : 0);
      pts.push({ x: 120 + Math.cos(a) * rx, y: 45 + Math.sin(a) * (30 + r() * 6) });
    }
    S.wash([pts], p[0], { pig2: p[1], density: 0.42, soft: 1, edge: 1.6, edgeR: 3, noise: 0.5, gran: 0.7, amt: 0.35, layers: 4, blooms: 1, bloomR: 16 });
    return S.canvas({ flat: true, paper: [255, 255, 255] }).toDataURL();
  }
  function slot(letter) {
    var S = new Sheet(cardTex, 4242 + letter.charCodeAt(0));
    S.wash([rect(10, 10, CW - 20, CH - 20, 10)], '#8a8f9a', { pig2: '#a89a7a', density: 0.1, soft: 4, edge: 1.6, edgeR: 6, noise: 0.6, gran: 0.9, amt: 0.4, layers: 3, blooms: 1, bloomR: 30 });
    S.line(roundRectPts(8, 8, CW - 16, CH - 16, 16, 7), GRAPHITE, { width: 2, density: 0.5, broken: 0.12, closed: true, peaks: true, gran: 0.9 });
    if (letter !== ' ') S.text(letter, CW / 2, CH / 2 + 46, 130, GRAPHITE, { align: 'center', density: 0.22, edge: 0.6, edgeR: 3, gran: 0.9, peaks: true });
    return S.canvas({ flat: true, paper: [255, 255, 255] }).toDataURL();
  }
  function splash(s) {
    var S = new Sheet(Tex(200, 200, 9), 300 + s), su = SUITS[s];
    S.wash([circle(100, 100, 64, 64, 14)], su.wash[1], { pig2: su.wash[0], density: 0.35, soft: 2, edge: 2.2, edgeR: 6, noise: 0.6, amt: 0.7, layers: 4, blooms: 1, bloomR: 28 });
    S.drops(scatter(S, 100, 100, 92, 24, 3.4), su.wash[0], { density: 0.7 });
    return S.canvas({ flat: true, paper: [255, 255, 255] }).toDataURL();
  }
  function sheetPaper() {
    var W = 520, H = 640, S = new Sheet(Tex(W, H, 55, 1.2), 99);
    S.wash([circle(40, 30, 200, 120, 12)], '#e8b030', { pig2: '#d8706a', density: 0.12, soft: 12, edge: 1.5, edgeR: 8, noise: 0.6, gran: 0.9, amt: 0.8, layers: 4, blooms: 1, bloomR: 40 });
    S.wash([circle(W - 30, H - 20, 210, 130, 12)], '#3f86b8', { pig2: '#6a3f9a', density: 0.09, soft: 12, edge: 1.5, edgeR: 8, noise: 0.6, gran: 0.9, amt: 0.8, layers: 4 });
    return S.canvas({ paper: [252, 249, 240], deckle: 7 }).toDataURL();
  }
  // The game title, painted letter by letter with two pigments bleeding into each other.
  function title(text) {
    var size = 76, probe = mk(10, 10).getContext('2d');
    probe.font = '700 ' + size + 'px ' + FONT;
    var W = Math.ceil(probe.measureText(text).width) + 50, H = 108;
    var S = new Sheet(Tex(W, H, 21), 7 + text.length);
    S.wash([circle(W / 2, 64, W / 2 - 12, 22, 16)], '#e8b030', { pig2: '#d8706a', density: 0.18, soft: 6, edge: 1.5, edgeR: 5, noise: 0.6, amt: 0.6, layers: 3, blooms: 1, bloomR: 20 });
    S.text(text, 22, 80, size, '#24308a', { pig2: '#b51f4a', density: 1, edge: 1.1, edgeR: 2, noise: 0.35, gran: 0.5 });
    S.drops(scatter(S, W * 0.8, 60, 40, 8, 2), '#b51f4a', { density: 0.6 });
    return { url: S.canvas({ flat: true, paper: [255, 255, 255] }).toDataURL(), w: W, h: H };
  }

  function nextFrame() { return new Promise(function (res) { (window.requestAnimationFrame || setTimeout)(function () { res(); }); }); }
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var t = new Promise(function (res) { setTimeout(res, 2500); });
    return Promise.race([Promise.all([document.fonts.load('700 80px "Caveat"', 'AJQK10'), document.fonts.ready]), t]).catch(function () {});
  }

  // Paints everything; onProgress(0..1) lets the page show a loading bar.
  function init(onProgress) {
    var out = { faces: [], backs: {}, splash: [], swatch: {}, slot: {} };
    return fontsReady().then(function () {
      cardTex = Tex(CW, CH, 11);
      var jobs = [], i;
      for (i = 0; i < 52; i++) jobs.push((function (id) { return function () { out.faces[id] = face(Math.floor(id / 13), id % 13 + 1); }; })(i));
      ['night', 'meadow', 'sunset'].forEach(function (k) { jobs.push(function () { out.backs[k] = back(k); }); });
      for (i = 0; i < 4; i++) jobs.push((function (s) { return function () { out.splash[s] = splash(s); }; })(i));
      Object.keys(SWATCH).forEach(function (k, j) { jobs.push(function () { out.swatch[k] = swatch(k, 600 + j); }); });
      ['A', 'K', ' '].forEach(function (l) { jobs.push(function () { out.slot[l] = slot(l); }); });
      jobs.push(function () { out.sheet = sheetPaper(); });
      var total = jobs.length, done = 0;
      function step() {
        var t0 = performance.now();
        while (jobs.length && performance.now() - t0 < 40) { jobs.shift()(); done++; }
        if (onProgress) onProgress(done / total);
        if (jobs.length) return nextFrame().then(step);
        return out;
      }
      return step();
    });
  }

  window.Watercolor = { init: init, table: table, title: title, CW: CW, CH: CH };
})();
