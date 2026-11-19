/* Bayang Kuntilanak — logika game murni (tanpa DOM / tanpa THREE).
   2.5D side-view: kamera samping tetap, gerak kiri/kanan (sumbu X) +
   maju/mundur dalam (sumbu Z, rentang sempit). camYaw selalu 0:
   W = -Z (masuk ke dalam layar), D = +X (ke kanan layar).
   Bisa diuji di Node. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.BayangKuntilanakLogic = api;
  if (typeof globalThis !== 'undefined') globalThis.BayangKuntilanakLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Denah (meter, bidang XZ): hutan bambu x -30..30, z -3..3.
  // Gerbang desa di barat (x -30), punden tua di timur (x 26).
  // Sungai kecil melintang di x -16..-14, hanya bisa dilewati lewat
  // jembatan bambu (celah z -1..1). Pohon beringin di (0, -2.5),
  // gubuk tua di (14..17, -3..-1.5).
  var WALLS = [
    // tepi hutan: utara & selatan (rumpun bambu rapat)
    { x1: -30, z1: -3.35, x2: 30, z2: -3.05 },
    { x1: -30, z1: 3.05, x2: 30, z2: 3.35 },
    // tepi timur hutan (rapat)
    { x1: 29.85, z1: -3.2, x2: 30.15, z2: 3.2 },
    // gerbang desa (barat): dua sisi, celah z -1..1
    { x1: -30.15, z1: -3.2, x2: -29.85, z2: -1 },
    { x1: -30.15, z1: 1, x2: -29.85, z2: 3.2 },
    // sungai (x -16..-14): hanya jembatan (z -1..1) yang bisa dilewati
    { x1: -16, z1: -3.2, x2: -14, z2: -1 },
    { x1: -16, z1: 1, x2: -14, z2: 3.2 }
  ];

  var FURNITURE = [
    // batang beringin besar (x -1.2..1.2, z -3.7..-1.3)
    { x1: -1.2, z1: -3.7, x2: 1.2, z2: -1.3, kind: 'beringin' },
    // gubuk tua (x 14..17, z -3..-1.5)
    { x1: 14, z1: -3, x2: 17, z2: -1.5, kind: 'gubuk' },
    // rumpun bambu penghalang (jalur tengah z=0 selalu kosong)
    { x1: -25.6, z1: 2.1, x2: -24.4, z2: 2.9, kind: 'bambu' },
    { x1: -18.6, z1: -2.9, x2: -17.4, z2: -2.1, kind: 'bambu' },
    { x1: -6.6, z1: 2.1, x2: -5.4, z2: 2.9, kind: 'bambu' },
    { x1: 3.4, z1: -2.9, x2: 4.6, z2: -2.1, kind: 'bambu' },
    { x1: 9.4, z1: 2.1, x2: 10.6, z2: 2.9, kind: 'bambu' },
    { x1: 21.4, z1: -2.9, x2: 22.6, z2: -2.1, kind: 'bambu' },
    { x1: 27.4, z1: 2.1, x2: 28.6, z2: 2.9, kind: 'bambu' },
    // batu-batu besar di tepi jalur
    { x1: -11.6, z1: -2.9, x2: -10.4, z2: -2.1, kind: 'batu' },
    { x1: 7.4, z1: -2.9, x2: 8.6, z2: -2.1, kind: 'batu' },
    { x1: -1.6, z1: 2.1, x2: -0.4, z2: 2.9, kind: 'batu' }
  ];

  // ---- 3 tempat sembunyi bertema hutan bambu (ala Little Nightmares) ----
  // 1. Lubang batang bambu besar (merangkak masuk) — dekat punden tua.
  // 2. Kolong gubuk tua (ruang sempit di bawah lantai gubuk) — jalur patroli.
  // 3. Balik bambu tumbang (jongkok di balik batang tumbang) — dekat gerbang.
  // Selama bersembunyi Kuntilanak tidak bisa melihat Dimas; kejar-kejaran
  // yang sedang berjalan putus (musuh masuk mode search lalu patrol).
  var HIDING = [
    { id: 'tumbang', kind: 'tumbang', x: -25, z: 1.5, x1: -26.2, z1: 1.0, x2: -23.8, z2: 2.0, room: 'Dekat Gerbang', label: 'Sembunyi di balik bambu tumbang [E]' },
    { id: 'kolong', kind: 'kolong', x: 15.5, z: -1.1, x1: 14.9, z1: -1.5, x2: 16.1, z2: -0.7, room: 'Kolong Gubuk', label: 'Sembunyi di kolong gubuk [E]' },
    { id: 'lubang', kind: 'lubang', x: 23.5, z: -1.2, x1: 22.9, z1: -1.7, x2: 24.1, z2: -0.7, room: 'Dekat Punden Tua', label: 'Merangkak ke lubang bambu [E]' }
  ];

  // ---- 3 sesajen yang dicari ----
  // Lampion ada di rak bambu tinggi (17.8, 0) — hanya bisa diraih kalau
  // peti bambu sudah didorong ke dekat rak (teka-teki ala Little Nightmares).
  var ITEMS = [
    { id: 'melati', name: 'Bunga Melati', x: -12, z: 0, room: 'Tepi Sungai' },
    { id: 'kemenyan', name: 'Kemenyan', x: 0, z: 1, room: 'Bawah Beringin' },
    { id: 'lampion', name: 'Lampion', x: 17.8, z: 0, room: 'Rak Gubuk' }
  ];

  // ---- Peti bambu yang bisa didorong (teka-teki) ----
  // Peti meluncur di jalur (z=0), x 10..18.5. Dorong ke timur sampai
  // x >= 16.6 supaya Dimas bisa naik dan meraih lampion di rak.
  var CRATE = { x: 12, z: 0, w: 1.2, d: 1.0, minX: 10, maxX: 18.5, needX: 16.6 };

  // ---- Punden kecil berlilin (checkpoint) ----
  var CANDLES = [
    { id: 'lilin1', x: -24, z: -2, room: 'Tepi Barat' },
    { id: 'lilin2', x: 2, z: -2, room: 'Dekat Beringin' },
    { id: 'lilin3', x: 20, z: -2, room: 'Dekat Punden Tua' }
  ];

  // ---- Baterai cadangan lentera ----
  var BATTERIES = [
    { id: 'bat1', x: -10, z: 1 },
    { id: 'bat2', x: 6, z: 2 },
    { id: 'bat3', x: 12, z: -1 },
    { id: 'bat4', x: 24, z: 2 }
  ];

  // ---- Punden tua (tempat meletakkan sesajen) ----
  var PUNDEN = { x: 26, z: 0 };

  // Rute patroli Kuntilanak: menyusuri jalur hutan bolak-balik.
  var WAYPOINTS = [
    { x: -20, z: 0 }, { x: -8, z: 1 }, { x: 0, z: -1 }, { x: 8, z: 1 },
    { x: 20, z: 0 }, { x: 26, z: -1 }, { x: 12, z: 0 }, { x: -12, z: -1 }
  ];

  var START = { x: -27, z: 0, camYaw: 0 };
  var EXIT = { x: -28.5 }; // gerbang desa (barat)
  var PLAYER_R = 0.35;
  var WALK_SPEED = 3.0, RUN_SPEED = 5.2;
  var ENEMY_PATROL = 1.6, ENEMY_CHASE = 3.2, ENEMY_HUNT = 4.2;
  var VISION_RANGE = 6, VISION_RANGE_LIT = 7.5, VISION_HALF_ANGLE = 0.9;
  var HEAR_RANGE = 8, CATCH_DIST = 0.8, INTERACT_DIST = 1.9;
  // Jeda curiga: musuh harus melihat pemain terus-menerus selama ini
  // sebelum mengejar. LOST_TIME: seberapa cepat musuh menyerah saat
  // kehilangan jejak pemain.
  var SUSPICION_TIME = 0.7, LOST_TIME = 1.5;

  function dist(x1, z1, x2, z2) {
    var dx = x2 - x1, dz = z2 - z1;
    return Math.sqrt(dx * dx + dz * dz);
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function angDiff(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  }
  function angDiffSigned(a, b) {
    var d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function pointInBox(x, z, b) { return x >= b.x1 && x <= b.x2 && z >= b.z1 && z <= b.z2; }

  function circleHits(x, z, r, boxes) {
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (x + r > b.x1 && x - r < b.x2 && z + r > b.z1 && z - r < b.z2) return true;
    }
    return false;
  }

  function hasLOS(x1, z1, x2, z2) {
    var d = dist(x1, z1, x2, z2);
    var steps = Math.max(1, Math.ceil(d / 0.2));
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      for (var j = 0; j < WALLS.length; j++) {
        if (pointInBox(x, z, WALLS[j])) return false;
      }
    }
    return true;
  }

  function solids() {
    return WALLS.concat(FURNITURE).concat(HIDING.map(function (c) {
      return { x1: c.x1, z1: c.z1, x2: c.x2, z2: c.z2 };
    }));
  }

  // Kotak peti bambu pada posisi saat ini (peti bergerak, jadi tidak masuk solids()).
  function crateBox(cx) {
    return {
      x1: cx - CRATE.w / 2, z1: CRATE.z - CRATE.d / 2,
      x2: cx + CRATE.w / 2, z2: CRATE.z + CRATE.d / 2
    };
  }

  function Game() { this.reset(); }

  Game.prototype.reset = function () {
    this.state = 'menu'; // menu | playing | paused | gameover | win
    this.time = 0;
    this.finalTime = 0;
    this.lives = 3;
    this.battery = 100;
    this.flashlight = false;
    this.player = { x: START.x, z: START.z, yaw: START.camYaw, camYaw: START.camYaw, camPitch: 0.25, hidden: false, invuln: 0 };
    this.checkpoint = { x: START.x, z: START.z };
    this.items = {};
    ITEMS.forEach(function (it) { this.items[it.id] = false; }.bind(this));
    this.itemsGot = 0;
    this.candles = {};
    CANDLES.forEach(function (c) { this.candles[c.id] = false; }.bind(this));
    this.batteries = {};
    BATTERIES.forEach(function (b) { this.batteries[b.id] = false; }.bind(this));
    this.enemy = {
      x: WAYPOINTS[0].x, z: WAYPOINTS[0].z, yaw: 0,
      state: 'patrol', wp: 1, tx: WAYPOINTS[1].x, tz: WAYPOINTS[1].z,
      lastX: 0, lastZ: 0, lostTimer: 0, searchTimer: 0,
      stuckTimer: 0, stuckX: WAYPOINTS[0].x, stuckZ: WAYPOINTS[0].z,
      suspicionTimer: 0
    };
    this.finalChase = false;
    this.suspicion = 0; // 0..1: seberapa curiga Kuntilanak (untuk view)
    this.crate = { x: CRATE.x, z: CRATE.z };
    this.pushing = false;
    this.input = { f: 0, s: 0, run: false };
    this.events = [];
    this.chaseWarn = false;
    this.noise = 0;
  };

  Game.prototype.start = function () {
    this.reset();
    this.state = 'playing';
    this.emit('start', {});
  };

  Game.prototype.pause = function () {
    if (this.state === 'playing') { this.state = 'paused'; this.emit('pause', {}); }
  };
  Game.prototype.resume = function () {
    if (this.state === 'paused') { this.state = 'playing'; this.emit('resume', {}); }
  };
  Game.prototype.toMenu = function () { this.reset(); };

  // ---- Save / Load (murni data, tanpa DOM/localStorage) ----
  // toSave: serialisasi state untuk autosave. fromSave: pulihkan state dari
  // save; kembalikan false kalau save rusak / versi tidak cocok.
  Game.prototype.toSave = function () {
    var items = {}, candles = {}, batteries = {}, k;
    for (k in this.items) items[k] = !!this.items[k];
    for (k in this.candles) candles[k] = !!this.candles[k];
    for (k in this.batteries) batteries[k] = !!this.batteries[k];
    return {
      v: 1,
      itemsGot: this.itemsGot,
      items: items, candles: candles, batteries: batteries,
      checkpoint: { x: this.checkpoint.x, z: this.checkpoint.z },
      lives: this.lives,
      time: Math.round(this.time * 100) / 100,
      px: Math.round(this.player.x * 100) / 100,
      pz: Math.round(this.player.z * 100) / 100,
      crateX: Math.round(this.crate.x * 100) / 100,
      battery: Math.round(this.battery * 100) / 100,
      flashlight: !!this.flashlight,
      finalChase: !!this.finalChase
    };
  };

  Game.prototype.fromSave = function (s) {
    if (!s || s.v !== 1) return false;
    if (typeof s.itemsGot !== 'number' || typeof s.lives !== 'number') return false;
    if (!s.checkpoint || typeof s.checkpoint.x !== 'number' || typeof s.checkpoint.z !== 'number') return false;
    this.reset();
    this.itemsGot = Math.max(0, Math.min(3, s.itemsGot | 0));
    var k;
    if (s.items) for (k in this.items) if (s.items[k]) this.items[k] = true;
    if (s.candles) for (k in this.candles) if (s.candles[k]) this.candles[k] = true;
    if (s.batteries) for (k in this.batteries) if (s.batteries[k]) this.batteries[k] = true;
    this.checkpoint = { x: s.checkpoint.x, z: s.checkpoint.z };
    this.lives = Math.max(1, Math.min(3, s.lives | 0));
    this.time = (typeof s.time === 'number' && s.time >= 0) ? s.time : 0;
    this.player.x = (typeof s.px === 'number') ? s.px : this.checkpoint.x;
    this.player.z = (typeof s.pz === 'number') ? s.pz : this.checkpoint.z;
    this.player.hidden = false;
    this.player.invuln = 0;
    if (typeof s.crateX === 'number') this.crate = { x: s.crateX, z: this.crate.z };
    if (typeof s.battery === 'number') this.battery = Math.max(0, Math.min(100, s.battery));
    this.flashlight = !!s.flashlight && this.battery > 0;
    this.finalChase = !!s.finalChase;
    if (this.finalChase) this.enemy.state = 'hunt';
    this.state = 'playing';
    return true;
  };

  Game.prototype.emit = function (type, data) {
    this.events.push({ type: type, data: data || {} });
    if (this.onEvent) this.onEvent(type, data || {});
  };
  Game.prototype.drainEvents = function () {
    var e = this.events; this.events = []; return e;
  };

  Game.prototype.setInput = function (f, s, run) {
    this.input.f = clamp(f, -1, 1);
    this.input.s = clamp(s, -1, 1);
    this.input.run = !!run;
  };

  // Kamera samping tetap: tidak ada putar kamera di game ini.
  Game.prototype.look = function (dx, dy) { /* sengaja kosong */ };

  Game.prototype.toggleFlashlight = function () {
    if (this.state !== 'playing') return;
    if (!this.flashlight && this.battery <= 0) { this.emit('nobattery', {}); return; }
    this.flashlight = !this.flashlight;
    this.emit('flashlight', { on: this.flashlight });
  };

  Game.prototype.nearestInteractable = function () {
    var p = this.player;
    if (p.hidden) return { type: 'unhide', label: 'Keluar dari persembunyian [E]' };
    var best = null, bestD = INTERACT_DIST;
    var i, d;
    for (i = 0; i < ITEMS.length; i++) {
      if (this.items[ITEMS[i].id]) continue;
      d = dist(p.x, p.z, ITEMS[i].x, ITEMS[i].z);
      if (ITEMS[i].id === 'lampion' && this.crate.x < CRATE.needX) {
        // Lampion di rak tinggi: belum bisa diraih sebelum peti didorong.
        if (d < bestD) { bestD = d; best = { type: 'toohigh', label: 'Terlalu tinggi — dorong peti bambu ke rak ini [E]' }; }
        continue;
      }
      if (d < bestD) { bestD = d; best = { type: 'item', id: ITEMS[i].id, label: 'Ambil ' + ITEMS[i].name + ' [E]' }; }
    }
    for (i = 0; i < BATTERIES.length; i++) {
      if (this.batteries[BATTERIES[i].id]) continue;
      d = dist(p.x, p.z, BATTERIES[i].x, BATTERIES[i].z);
      if (d < bestD) { bestD = d; best = { type: 'battery', id: BATTERIES[i].id, label: 'Ambil baterai [E]' }; }
    }
    for (i = 0; i < HIDING.length; i++) {
      d = dist(p.x, p.z, HIDING[i].x, HIDING[i].z);
      if (d < bestD) { bestD = d; best = { type: 'hide', id: HIDING[i].id, label: HIDING[i].label }; }
    }
    // punden tua: meletakkan sesajen (hanya kalau 3 sesajen sudah lengkap)
    d = dist(p.x, p.z, PUNDEN.x, PUNDEN.z);
    if (d < bestD) {
      bestD = d;
      if (this.itemsGot >= 3) {
        best = { type: 'punden', label: 'Letakkan sesajen di punden tua [E]' };
      } else {
        best = { type: 'punden-locked', label: 'Sesajen belum lengkap (' + this.itemsGot + '/3)' };
      }
    }
    return best;
  };

  Game.prototype.tryInteract = function () {
    if (this.state !== 'playing') return;
    var p = this.player;
    if (p.hidden) {
      p.hidden = false;
      this.emit('unhide', {});
      return;
    }
    var near = this.nearestInteractable();
    if (!near) return;
    if (near.type === 'item') {
      this.items[near.id] = true;
      this.itemsGot++;
      this.emit('pickup', { id: near.id, count: this.itemsGot });
    } else if (near.type === 'battery') {
      this.batteries[near.id] = true;
      this.battery = Math.min(100, this.battery + 45);
      this.emit('battery', { battery: this.battery });
    } else if (near.type === 'hide') {
      p.hidden = true;
      this.emit('hide', { id: near.id });
    } else if (near.type === 'punden') {
      if (this.itemsGot >= 3 && !this.finalChase) {
        this.finalChase = true;
        this.enemy.state = 'hunt';
        this.enemy.lostTimer = 0;
        this.enemy.suspicionTimer = 0;
        this.emit('final', {});
      }
    } else if (near.type === 'punden-locked') {
      this.emit('locked', { count: this.itemsGot });
    } else if (near.type === 'toohigh') {
      this.emit('toohigh', {});
    }
  };

  Game.prototype.placeEnemyAhead = function (dist) {
    // Pindahkan Kuntilanak ke titik kosong di dekat pemain (untuk jumpscare
    // terskrip sesajen ke-3). Coba dulu ke TIMUR (+X): saat kejar-kejaran
    // final pemain lari ke barat, jadi musuh harus muncul di belakangnya,
    // bukan menghadang di jalur lari.
    var p = this.player, e = this.enemy;
    var sol = solids().concat([crateBox(this.crate.x)]);
    var tries = [
      { yaw: p.camYaw - Math.PI / 2, d: dist },       // timur (+X)
      { yaw: p.camYaw + Math.PI / 2, d: dist },       // barat (-X)
      { yaw: p.camYaw, d: dist },                     // dalam (-Z)
      { yaw: p.camYaw - Math.PI / 2, d: dist * 0.75 },
      { yaw: p.camYaw + Math.PI / 2, d: dist * 0.75 },
      { yaw: p.camYaw + Math.PI, d: dist * 0.75 }
    ];
    for (var i = 0; i < tries.length; i++) {
      var t = tries[i];
      var x = p.x + (-Math.sin(t.yaw)) * t.d;
      var z = p.z + (-Math.cos(t.yaw)) * t.d;
      if (x < -29.4 || x > 29.4 || z < -2.6 || z > 2.6) continue;
      if (!circleHits(x, z, 0.4, sol)) {
        e.x = x; e.z = z;
        e.yaw = Math.atan2(-(p.x - x), -(p.z - z));
        e.state = 'hunt';
        e.lastX = p.x; e.lastZ = p.z; e.lostTimer = 0; e.suspicionTimer = 0;
        return true;
      }
    }
    return false;
  };

  Game.prototype._movePlayer = function (dt) {
    var p = this.player;
    if (p.hidden) return;
    var f = this.input.f, s = this.input.s;
    if (f === 0 && s === 0) return;
    var len = Math.sqrt(f * f + s * s);
    if (len > 1) { f /= len; s /= len; }
    var speed = this.input.run ? RUN_SPEED : WALK_SPEED;
    // gerak relatif terhadap arah kamera (camYaw selalu 0: f = -Z, s = +X)
    var fx = -Math.sin(p.camYaw), fz = -Math.cos(p.camYaw);
    var rx = Math.cos(p.camYaw), rz = -Math.sin(p.camYaw);
    var dx = (fx * f + rx * s) * speed * dt;
    var dz = (fz * f + rz * s) * speed * dt;
    var sol = solids();
    var cb = crateBox(this.crate.x);
    this.pushing = false;
    // Langkah X: peti bambu bisa didorong (hanya sepanjang sumbu X).
    var nx = p.x + dx;
    if (circleHits(nx, p.z, PLAYER_R, sol)) {
      // terhalang dinding/furnitur: diam
    } else if (dx !== 0 && circleHits(nx, p.z, PLAYER_R, [cb])) {
      // menabrak peti dari samping: coba dorong peti searah dx.
      // ncx dijepit ke [minX, maxX] dulu (bukan ditolak) supaya tidak macet
      // di batas akibat galat floating-point; pemain ikut bergerak sejauh
      // peti bergerak, jadi tidak pernah menembus peti.
      var ncx = Math.max(CRATE.minX, Math.min(CRATE.maxX, this.crate.x + dx));
      if (ncx !== this.crate.x && !circleHits(ncx, this.crate.z, CRATE.w / 2, sol)) {
        var moved = ncx - this.crate.x;
        this.crate.x = ncx;
        this.pushing = true;
        p.x = p.x + moved;
      }
      // kalau peti tidak bisa bergerak, pemain tertahan
    } else {
      p.x = nx;
    }
    // Langkah Z: peti hanya menghalangi (tidak bisa didorong ke samping)
    var nz = p.z + dz;
    if (!circleHits(p.x, nz, PLAYER_R, sol) && !circleHits(p.x, nz, PLAYER_R, [cb])) p.z = nz;
    this.noise = this.input.run ? 1 : 0;
    // badan Dimas menghadap arah gerak
    var targetYaw = Math.atan2(-dx, -dz);
    p.yaw += angDiffSigned(targetYaw, p.yaw) * Math.min(1, dt * 10);
  };

  Game.prototype._updateEnemy = function (dt) {
    var e = this.enemy, p = this.player;
    var d = dist(e.x, e.z, p.x, p.z);
    var speed = ENEMY_PATROL;
    var targetX = e.tx, targetZ = e.tz;

    if (this.finalChase) {
      e.state = 'hunt';
      targetX = p.x; targetZ = p.z;
      speed = ENEMY_HUNT;
    } else if (e.state === 'patrol' || e.state === 'investigate' || e.state === 'search') {
      var seen = false, angTo = 0;
      if (!p.hidden && p.invuln <= 0) {
        var range = this.flashlight ? VISION_RANGE_LIT : VISION_RANGE;
        if (d < range) {
          angTo = Math.atan2(-(p.x - e.x), -(p.z - e.z));
          if (d < 1.8 || angDiff(angTo, e.yaw) < VISION_HALF_ANGLE) {
            if (hasLOS(e.x, e.z, p.x, p.z)) seen = true;
          }
        }
      }
      // Jeda curiga: musuh harus melihat pemain terus-menerus selama
      // SUSPICION_TIME sebelum mengejar. Selama jeda dia berhenti dan
      // menatap pemain — Dimas punya waktu untuk sembunyi/lari.
      var frozen = false;
      if (seen) {
        if (e.suspicionTimer === 0) this.emit('suspicion', {});
        e.suspicionTimer += dt;
        e.yaw = angTo; // menatap pemain
        if (e.suspicionTimer >= SUSPICION_TIME) {
          if (e.state !== 'chase') this.emit('chase', {});
          e.state = 'chase';
          e.lastX = p.x; e.lastZ = p.z; e.lostTimer = 0;
          e.suspicionTimer = 0;
          targetX = p.x; targetZ = p.z; speed = ENEMY_CHASE;
        } else {
          frozen = true;
          targetX = e.x; targetZ = e.z; // diam di tempat sambil curiga
        }
      } else {
        if (e.suspicionTimer > 0) this.emit('suspicionLost', {});
        e.suspicionTimer = 0;
        if (e.state === 'patrol' && this.noise && d < HEAR_RANGE) {
          e.state = 'investigate';
          e.tx = p.x; e.tz = p.z;
        }
      }
      if (!frozen) {
        if (e.state === 'patrol') {
          targetX = e.tx; targetZ = e.tz;
          if (dist(e.x, e.z, targetX, targetZ) < 0.3) {
            e.wp = (e.wp + 1) % WAYPOINTS.length;
            e.tx = WAYPOINTS[e.wp].x; e.tz = WAYPOINTS[e.wp].z;
          }
        } else if (e.state === 'investigate') {
          targetX = e.tx; targetZ = e.tz;
          if (dist(e.x, e.z, targetX, targetZ) < 0.4) { e.state = 'patrol'; e.wp = 0; e.tx = WAYPOINTS[0].x; e.tz = WAYPOINTS[0].z; }
        } else if (e.state === 'search') {
          targetX = e.lastX; targetZ = e.lastZ;
          e.searchTimer -= dt;
          if (dist(e.x, e.z, targetX, targetZ) < 0.4 || e.searchTimer <= 0) {
            e.state = 'patrol'; e.wp = 0; e.tx = WAYPOINTS[0].x; e.tz = WAYPOINTS[0].z;
          }
        }
      }
    } else if (e.state === 'chase') {
      var seesNow = false;
      if (!p.hidden && p.invuln <= 0 && d < VISION_RANGE_LIT + 2 && hasLOS(e.x, e.z, p.x, p.z)) {
        seesNow = true;
        e.lastX = p.x; e.lastZ = p.z; e.lostTimer = 0;
      } else {
        e.lostTimer += dt;
      }
      if (p.hidden || e.lostTimer > LOST_TIME) {
        e.state = 'search';
        e.searchTimer = 4;
        this.emit('lost', {});
      } else {
        targetX = seesNow ? p.x : e.lastX;
        targetZ = seesNow ? p.z : e.lastZ;
        speed = ENEMY_CHASE;
      }
      if (e.state === 'search') { targetX = e.lastX; targetZ = e.lastZ; }
    }

    var dx = targetX - e.x, dz = targetZ - e.z;
    var dd = Math.sqrt(dx * dx + dz * dz);
    if (dd > 0.05) {
      var step = Math.min(dd, speed * dt);
      var mx = dx / dd * step, mz = dz / dd * step;
      var sol = solids();
      var nx = e.x + mx;
      if (!circleHits(nx, e.z, 0.35, sol)) e.x = nx;
      var nz = e.z + mz;
      if (!circleHits(e.x, nz, 0.35, sol)) e.z = nz;
      e.yaw = Math.atan2(-dx, -dz);
    }

    // anti-macat: kalau 1,5 dtk tidak bergerak padahal target jauh, loncat ke waypoint berikut
    if (dd > 0.5) {
      if (dist(e.x, e.z, e.stuckX, e.stuckZ) < 0.05) {
        e.stuckTimer += dt;
        if (e.stuckTimer > 1.5 && (e.state === 'patrol' || e.state === 'investigate' || e.state === 'search')) {
          e.wp = (e.wp + 1) % WAYPOINTS.length;
          e.tx = WAYPOINTS[e.wp].x; e.tz = WAYPOINTS[e.wp].z;
          e.state = 'patrol';
          e.stuckTimer = 0;
          e.stuckX = e.x; e.stuckZ = e.z;
        }
      } else {
        e.stuckTimer = 0;
        e.stuckX = e.x; e.stuckZ = e.z;
      }
    } else {
      e.stuckTimer = 0;
      e.stuckX = e.x; e.stuckZ = e.z;
    }

    // Kecurigaan untuk view (peringatan + pose takut Dimas): 1 saat
    // mengejar, pecahan 0..1 selama jeda curiga, 0 saat aman.
    this.suspicion = (e.state === 'chase' || e.state === 'hunt') ? 1 :
      clamp(e.suspicionTimer / SUSPICION_TIME, 0, 1);
    this.chaseWarn = (e.state === 'chase' || e.state === 'hunt');
  };

  Game.prototype._checkCatch = function () {
    var e = this.enemy, p = this.player;
    if (p.hidden || p.invuln > 0) return;
    if (this.state !== 'playing') return;
    if (dist(e.x, e.z, p.x, p.z) < CATCH_DIST) {
      this.lives--;
      this.emit('caught', { lives: this.lives });
      if (this.lives <= 0) {
        this.state = 'gameover';
        this.emit('gameover', {});
        return;
      }
      p.x = this.checkpoint.x; p.z = this.checkpoint.z;
      p.hidden = false;
      p.invuln = 2.5;
      if (this.finalChase) {
        // tertangkap saat kejar-kejaran final: Kuntilanak kembali ke punden
        // tua (timur), jauh di belakang jalur lari pemain ke gerbang.
        e.x = PUNDEN.x; e.z = PUNDEN.z;
        e.state = 'hunt';
      } else {
        e.x = WAYPOINTS[0].x; e.z = WAYPOINTS[0].z;
        e.state = 'patrol';
      }
      e.wp = 1; e.tx = WAYPOINTS[1].x; e.tz = WAYPOINTS[1].z;
      e.lostTimer = 0; e.suspicionTimer = 0;
    }
  };

  Game.prototype.update = function (dt) {
    if (this.state !== 'playing') return;
    dt = Math.min(dt, 0.05);
    this.time += dt;
    if (this.player.invuln > 0) this.player.invuln -= dt;
    this.noise = 0;

    this._movePlayer(dt);

    if (this.flashlight) {
      this.battery -= 1.2 * dt;
      if (this.battery <= 0) {
        this.battery = 0;
        this.flashlight = false;
        this.emit('batterydead', {});
      }
    }

    // lilin punden kecil: nyala otomatis saat didekati
    for (var i = 0; i < CANDLES.length; i++) {
      var c = CANDLES[i];
      if (!this.candles[c.id] && dist(this.player.x, this.player.z, c.x, c.z) < 1.3) {
        this.candles[c.id] = true;
        this.checkpoint = { x: c.x, z: c.z };
        this.emit('candle', { id: c.id, room: c.room });
      }
    }

    this._updateEnemy(dt);
    this._checkCatch();

    // menang: sesajen sudah diletakkan, lalu sampai di gerbang desa (barat)
    if (this.finalChase && this.state === 'playing') {
      var p = this.player;
      if (p.x < EXIT.x) {
        this.state = 'win';
        this.finalTime = this.time;
        this.emit('win', { time: this.finalTime });
      }
    }
  };

  return {
    Game: Game,
    WALLS: WALLS,
    FURNITURE: FURNITURE,
    HIDING: HIDING,
    ITEMS: ITEMS,
    CANDLES: CANDLES,
    BATTERIES: BATTERIES,
    PUNDEN: PUNDEN,
    CRATE: CRATE,
    WAYPOINTS: WAYPOINTS,
    START: START,
    EXIT: EXIT,
    RUN_SPEED: RUN_SPEED, WALK_SPEED: WALK_SPEED,
    ENEMY_PATROL: ENEMY_PATROL, ENEMY_CHASE: ENEMY_CHASE, ENEMY_HUNT: ENEMY_HUNT,
    VISION_RANGE: VISION_RANGE, VISION_RANGE_LIT: VISION_RANGE_LIT,
    VISION_HALF_ANGLE: VISION_HALF_ANGLE, HEAR_RANGE: HEAR_RANGE,
    CATCH_DIST: CATCH_DIST, SUSPICION_TIME: SUSPICION_TIME, LOST_TIME: LOST_TIME
  };
});
