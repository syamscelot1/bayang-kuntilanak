/* Bayang Kuntilanak — lapisan Three.js (2.5D side-view) + input + audio + jumpscare.
   Memakai window.THREE (UMD lokal) dan window.BayangKuntilanakLogic (logic.js).
   Tanpa request jaringan, tanpa file eksternal.
   Suasana ala Little Nightmares: palet biru-abu dingin + aksen amber hangat,
   kabut tebal, dunia serba besar dibanding Dimas yang kecil, kamera samping
   dengan parallax dan lerp halus. Semua aset prosedural/orisinil. */
(function () {
  'use strict';

  var THREE = (typeof window !== 'undefined' && window.THREE) ||
    (typeof globalThis !== 'undefined' && globalThis.THREE);
  var L = (typeof window !== 'undefined' && window.BayangKuntilanakLogic) ||
    (typeof globalThis !== 'undefined' && globalThis.BayangKuntilanakLogic);

  function fmtTime(s) {
    s = Math.floor(s);
    var m = Math.floor(s / 60), r = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }

  function countTriangles(scene) {
    var tris = 0, meshes = 0;
    scene.traverse(function (o) {
      if (o.isMesh && o.geometry) {
        meshes++;
        var g = o.geometry;
        if (g.index) tris += g.index.count / 3;
        else if (g.attributes && g.attributes.position) tris += g.attributes.position.count / 3;
      }
    });
    return { triangles: Math.round(tris), meshes: meshes };
  }

  // ---------- Bangun dunia 3D (murni THREE + data logic, tanpa DOM) ----------
  function buildWorld(THREE, L) {
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070c);
    scene.fog = new THREE.FogExp2(0x05070c, 0.035);

    var camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 120);

    // Cahaya dingin bulan + cahaya hangat lentera (aksen amber).
    var ambient = new THREE.AmbientLight(0x2a3550, 0.55);
    scene.add(ambient);
    var moonLight = new THREE.DirectionalLight(0x8fa8cc, 0.3);
    moonLight.position.set(-12, 18, -6);
    scene.add(moonLight);

    var lantern = new THREE.SpotLight(0xffc06a, 2.6, 20, 0.7, 0.6, 1.0);
    lantern.visible = false;
    scene.add(lantern);
    scene.add(lantern.target);

    var candleLight = new THREE.PointLight(0xff8844, 0, 8, 1.5);
    scene.add(candleLight);

    function mat(color) { return new THREE.MeshLambertMaterial({ color: color }); }
    function basic(color, opts) {
      var o = { color: color };
      if (opts) for (var k in opts) o[k] = opts[k];
      return new THREE.MeshBasicMaterial(o);
    }
    function box(w, h, d, color, x, y, z, parent) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      m.position.set(x, y, z);
      (parent || scene).add(m);
      return m;
    }

    // ---- Tanah + jalur + sungai + jembatan ----
    var floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 12), mat(0x1d241c));
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 0); scene.add(floor);
    box(62, 0.02, 3.0, 0x2e2a20, 0, 0.01, 0); // jalur tanah
    box(2, 0.02, 6.4, 0x0e1e2e, -15, -0.02, 0); // air sungai (gelap)
    box(2.6, 0.1, 2.2, 0x5a4630, -15, 0.08, 0); // papan jembatan
    box(2.6, 0.07, 0.07, 0x4a3826, -15, 0.55, -1.0);
    box(2.6, 0.07, 0.07, 0x4a3826, -15, 0.55, 1.0);
    box(0.08, 0.55, 0.08, 0x4a3826, -16.2, 0.3, -1.0);
    box(0.08, 0.55, 0.08, 0x4a3826, -16.2, 0.3, 1.0);
    box(0.08, 0.55, 0.08, 0x4a3826, -13.8, 0.3, -1.0);
    box(0.08, 0.55, 0.08, 0x4a3826, -13.8, 0.3, 1.0);

    // ---- Barisan bambu raksasa (tepi utara, latar belakang pemain) ----
    var i, x;
    for (i = 0; i < 12; i++) {
      x = -30 + i * 5 + ((i * 37) % 3);
      var h = 6 + ((i * 53) % 30) / 10;
      var b = box(0.3, 1, 0.3, 0x24382a, x, 0, -3.6);
      b.scale.y = h; b.position.y = h / 2;
    }
    // tepi selatan: hanya semak rendah (tidak boleh menutupi pandangan kamera)
    for (i = 0; i < 12; i++) {
      var tuft = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 6), mat(0x1e2e1e));
      tuft.position.set(-30 + i * 5.2 + ((i * 29) % 2), 0.27, 3.7);
      scene.add(tuft);
    }
    // ujung timur & barat hutan: bambu raksasa
    for (i = 0; i < 4; i++) {
      var hE = 7 + ((i * 41) % 40) / 10;
      var be = box(0.3, 1, 0.3, 0x24382a, 30.6, 0, -2.2 + i * 1.5);
      be.scale.y = hE; be.position.y = hE / 2;
      var hW = 7 + ((i * 47) % 40) / 10;
      var bw = box(0.3, 1, 0.3, 0x24382a, -30.6, 0, -2.2 + i * 1.5);
      bw.scale.y = hW; bw.position.y = hW / 2;
    }

    // ---- Lapisan parallax: siluet bambu latar di kedalaman berbeda ----
    // (bergerak lebih lambat dari kamera; makin jauh makin lambat)
    var parallax = [];
    var layerDefs = [
      { z: -6, k: 0.35, color: 0x0a0f14, n: 10, hMin: 7, hMax: 11 },
      { z: -11, k: 0.6, color: 0x070b10, n: 8, hMin: 9, hMax: 13 },
      { z: -18, k: 0.85, color: 0x080c12, n: 6, hMin: 11, hMax: 15 }
    ];
    layerDefs.forEach(function (ld, li) {
      var g = new THREE.Group();
      for (var j = 0; j < ld.n; j++) {
        var hh = ld.hMin + ((j * (31 + li * 7)) % 10) / 10 * (ld.hMax - ld.hMin);
        var xx = -58 + j * (116 / ld.n) + ((j * 17 + li * 5) % 4);
        var m = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1, 0.35),
          basic(ld.color, { fog: true }));
        m.scale.y = hh;
        m.position.set(xx, hh / 2, ld.z);
        g.add(m);
      }
      scene.add(g);
      parallax.push({ group: g, k: ld.k });
    });

    // ---- Bulan + bintang ----
    var moon = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 12),
      basic(0xcfd8e8, { fog: false }));
    moon.position.set(-16, 13, -20);
    scene.add(moon);
    var halo = new THREE.Mesh(new THREE.SphereGeometry(2.7, 16, 12),
      basic(0x8fa8cc, { fog: false, transparent: true, opacity: 0.15 }));
    halo.position.copy(moon.position);
    scene.add(halo);
    var starGeo = new THREE.BufferGeometry();
    var starPos = new Float32Array(14 * 3);
    for (i = 0; i < 14; i++) {
      starPos[i * 3] = -40 + i * 6 + ((i * 13) % 3);
      starPos[i * 3 + 1] = 9 + ((i * 29) % 60) / 10;
      starPos[i * 3 + 2] = -16 - ((i * 7) % 8);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    var stars = new THREE.Points(starGeo,
      new THREE.PointsMaterial({ color: 0x8899bb, size: 0.18, sizeAttenuation: true, fog: false }));
    scene.add(stars);

    // ---- Kunang-kunang (Points, 1 draw call) ----
    var FF = 26;
    var ffGeo = new THREE.BufferGeometry();
    var ffPos = new Float32Array(FF * 3);
    var ffBase = [], ffPhase = [];
    for (i = 0; i < FF; i++) {
      var fx = -28 + ((i * 37) % 56);
      var fy = 0.5 + ((i * 17) % 20) / 10;
      var fz = -2.5 + ((i * 23) % 50) / 10;
      ffBase.push([fx, fy, fz]);
      ffPhase.push(((i * 41) % 60) / 10);
      ffPos[i * 3] = fx; ffPos[i * 3 + 1] = fy; ffPos[i * 3 + 2] = fz;
    }
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    var fireflies = new THREE.Points(ffGeo,
      new THREE.PointsMaterial({ color: 0xaaff88, size: 0.12, sizeAttenuation: true, transparent: true, opacity: 0.85 }));
    scene.add(fireflies);

    // ---- Daun bambu jatuh melayang (Points, 1 draw call) ----
    var LF = 20;
    var lfGeo = new THREE.BufferGeometry();
    var lfPos = new Float32Array(LF * 3);
    var lfBase = [], lfPhase = [];
    for (i = 0; i < LF; i++) {
      var lx = -28 + ((i * 41) % 56);
      var ly = 3 + ((i * 19) % 40) / 10;
      var lz = -2.5 + ((i * 29) % 50) / 10;
      lfBase.push([lx, ly, lz]);
      lfPhase.push(((i * 37) % 60) / 10);
      lfPos[i * 3] = lx; lfPos[i * 3 + 1] = ly; lfPos[i * 3 + 2] = lz;
    }
    lfGeo.setAttribute('position', new THREE.BufferAttribute(lfPos, 3));
    var leaves = new THREE.Points(lfGeo,
      new THREE.PointsMaterial({ color: 0x6a7a4a, size: 0.14, sizeAttenuation: true, transparent: true, opacity: 0.7 }));
    scene.add(leaves);

    // ---- Lapisan kabut bergerak pelan (bidang tembus pandang) ----
    var fogPlanes = [];
    [[-4.5, 2.5, 0.05, 0.5, 0], [-9, 3, 0.04, 0.3, 2]].forEach(function (fd) {
      var fp = new THREE.Mesh(new THREE.PlaneGeometry(70, 6),
        new THREE.MeshBasicMaterial({ color: 0x8fa8cc, transparent: true, opacity: fd[2], depthWrite: false, fog: false }));
      fp.position.set(0, fd[1], fd[0]);
      scene.add(fp);
      fogPlanes.push({ mesh: fp, k: fd[3], phase: fd[4] });
    });

    // ---- Pantulan hangat lentera di tanah basah (cakram cahaya ikut Dimas) ----
    var glowDisc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20),
      new THREE.MeshBasicMaterial({ color: 0xffc06a, transparent: true, opacity: 0, depthWrite: false }));
    glowDisc.rotation.x = -Math.PI / 2;
    glowDisc.position.set(0, 0.02, 0);
    scene.add(glowDisc);

    // ---- Debu langkah kaki + percikan saat ambil sesajen (2 pool Points) ----
    function makePool(n, color, size, opacity) {
      var geo = new THREE.BufferGeometry();
      var pos = new Float32Array(n * 3);
      for (var q = 0; q < n; q++) { pos[q * 3 + 1] = -5; }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var pts = new THREE.Points(geo,
        new THREE.PointsMaterial({ color: color, size: size, sizeAttenuation: true, transparent: true, opacity: opacity }));
      scene.add(pts);
      var parts = [];
      for (var r = 0; r < n; r++) parts.push({ life: 0, vx: 0, vy: 0, vz: 0 });
      return { points: pts, parts: parts };
    }
    var dust = makePool(24, 0x8a7f6a, 0.16, 0.45);
    var burst = makePool(16, 0xffd27a, 0.2, 0.9);
    function spawnInto(pool, x, y, z, count, opt) {
      var spawned = 0;
      for (var q = 0; q < pool.parts.length && spawned < count; q++) {
        var pt = pool.parts[q];
        if (pt.life > 0) continue;
        pt.life = opt.life;
        pt.vx = (Math.random() - 0.5) * opt.spread;
        pt.vy = opt.up * (0.6 + Math.random() * 0.6);
        pt.vz = (Math.random() - 0.5) * opt.spread;
        var arr = pool.points.geometry.attributes.position.array;
        arr[q * 3] = x + (Math.random() - 0.5) * 0.2;
        arr[q * 3 + 1] = y;
        arr[q * 3 + 2] = z + (Math.random() - 0.5) * 0.2;
        spawned++;
      }
      pool.points.geometry.attributes.position.needsUpdate = true;
    }
    function updatePool(pool, dt, grav) {
      var arr = pool.points.geometry.attributes.position.array;
      for (var q = 0; q < pool.parts.length; q++) {
        var pt = pool.parts[q];
        if (pt.life <= 0) continue;
        pt.life -= dt;
        pt.vy += grav * dt;
        arr[q * 3] += pt.vx * dt;
        arr[q * 3 + 1] += pt.vy * dt;
        arr[q * 3 + 2] += pt.vz * dt;
        if (pt.life <= 0 || arr[q * 3 + 1] < 0.02) {
          pt.life = 0;
          arr[q * 3 + 1] = -5;
        }
      }
      pool.points.geometry.attributes.position.needsUpdate = true;
    }
    function spawnBurst(x, z) {
      spawnInto(burst, x, 0.6, z, 10, { life: 0.7, spread: 1.6, up: 1.8 });
    }

    // ---- Furnitur logika ----
    L.FURNITURE.forEach(function (f) {
      var w = f.x2 - f.x1, d = f.z2 - f.z1;
      var cx = (f.x1 + f.x2) / 2, cz = (f.z1 + f.z2) / 2;
      if (f.kind === 'beringin') {
        // Pohon beringin raksasa: batang besar + tajuk lebar + akar gantung
        var trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 7, 8), mat(0x3a2e22));
        trunk.position.set(cx, 3.5, cz); scene.add(trunk);
        [[0, 7.6, -2.5, 2.6], [-2.1, 6.9, -2.8, 2.0], [2.1, 7.0, -2.2, 1.7]].forEach(function (c) {
          var can = new THREE.Mesh(new THREE.SphereGeometry(c[3], 8, 6), mat(0x16240f));
          can.position.set(c[0], c[1], c[2]);
          can.scale.y = 0.55;
          scene.add(can);
        });
        for (var v = 0; v < 4; v++) {
          box(0.09, 2.0, 0.09, 0x2a2018, cx - 1 + v * 0.65, 2.2, cz + 0.9);
        }
        // akar beringin besar menjalar di tanah
        for (var rt = 0; rt < 5; rt++) {
          var root = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.22, 0.3), mat(0x3a2e22));
          var ang = -0.9 + rt * 0.45;
          root.position.set(cx + Math.sin(ang) * 1.6, 0.11, cz + Math.cos(ang) * 1.6);
          root.rotation.y = ang;
          scene.add(root);
        }
      } else if (f.kind === 'gubuk') {
        // Gubuk tua besar (dinding + atap limas + pintu gelap)
        box(w, 2.2, d, 0x4a3a28, cx, 1.1, cz);
        var roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.4, 4), mat(0x2e2418));
        roof.position.set(cx, 2.9, cz);
        roof.rotation.y = Math.PI / 4;
        scene.add(roof);
        box(0.8, 1.4, 0.06, 0x0a0806, cx, 0.7, cz + d / 2 + 0.01);
        box(0.6, 0.5, 0.06, 0x0a0806, cx + 1.0, 1.3, cz + d / 2 + 0.01);
      } else if (f.kind === 'bambu') {
        // Rumpun bambu penghalang: 3 batang
        for (var s = 0; s < 3; s++) {
          var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5, 5), mat(0x2a3d2a));
          stem.position.set(cx - 0.4 + (s % 3) * 0.4, 2.5, cz - 0.3 + Math.floor(s / 3) * 0.6);
          scene.add(stem);
        }
      } else { // batu
        var rock = new THREE.Mesh(new THREE.SphereGeometry(0.6, 7, 5), mat(0x3a3a3a));
        rock.position.set(cx, 0.25, cz);
        rock.scale.set(1.1, 0.55, 0.9);
        scene.add(rock);
      }
    });

    // ---- 3 tempat sembunyi bertema (lubang gelap + tepi bercahaya redup
    // yang berdenyut pelan, supaya pemain langsung paham itu tempat ngumpet) ----
    var hideMeshes = {};
    var hideRims = []; // material tepi cahaya redup (berdenyut di syncWorld)
    var swayLeaves = []; // daun di bambu tumbang (bergoyang di syncWorld)
    L.HIDING.forEach(function (c) {
      var g = new THREE.Group();
      if (c.kind === 'lubang') {
        // Batang bambu besar yang berlubang: Dimas merangkak masuk.
        var trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 2.6, 8), mat(0x2a3d2a));
        trunk.position.y = 1.3;
        g.add(trunk);
        // lubang gelap menghadap kamera (+Z)
        var hole = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16),
          new THREE.MeshBasicMaterial({ color: 0x000000 }));
        hole.position.set(0, 0.7, 0.46);
        g.add(hole);
        // tepi lubang bercahaya redup (kuning hangat, berdenyut)
        var rimMat = new THREE.MeshBasicMaterial({ color: 0x8a6a3a, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        var rim = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.44, 16), rimMat);
        rim.position.set(0, 0.7, 0.465);
        g.add(rim);
        hideRims.push(rimMat);
        // daun di pangkal batang
        for (var lf = 0; lf < 3; lf++) {
          var leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), mat(0x2f4530));
          leaf.position.set(-0.5 + lf * 0.5, 0.25, 0.35);
          leaf.rotation.x = 0.5;
          g.add(leaf);
        }
      } else if (c.kind === 'kolong') {
        // Kolong gubuk tua: celah gelap di bawah lantai gubuk (muka selatan).
        var dark = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.5),
          new THREE.MeshBasicMaterial({ color: 0x000000 }));
        dark.position.set(0, 0.35, -0.4);
        g.add(dark);
        // tepi atas celah bercahaya redup (kuning hangat, berdenyut)
        var barMat = new THREE.MeshBasicMaterial({ color: 0x8a6a3a, transparent: true, opacity: 0.5 });
        var bar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.05), barMat);
        bar.position.set(0, 0.72, -0.14);
        g.add(bar);
        hideRims.push(barMat);
        // tiang penyangga lantai gubuk di kiri-kanan celah
        box(0.12, 0.7, 0.12, 0x4a3826, -0.75, 0.35, -0.15, g);
        box(0.12, 0.7, 0.12, 0x4a3826, 0.75, 0.35, -0.15, g);
      } else {
        // Bambu tumbang: batang rebah + ujung berlubang gelap.
        var log = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.38, 2.6, 8), mat(0x4a3826));
        log.rotation.z = Math.PI / 2;
        log.position.y = 0.35;
        g.add(log);
        // ujung berlubang gelap menghadap timur (+X)
        var endHole = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16),
          new THREE.MeshBasicMaterial({ color: 0x000000 }));
        endHole.position.set(1.31, 0.35, 0);
        endHole.rotation.y = Math.PI / 2;
        g.add(endHole);
        // tepi ujung bercahaya redup (berdenyut)
        var endRimMat = new THREE.MeshBasicMaterial({ color: 0x8a6a3a, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        var endRim = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.38, 16), endRimMat);
        endRim.position.set(1.315, 0.35, 0);
        endRim.rotation.y = Math.PI / 2;
        g.add(endRim);
        hideRims.push(endRimMat);
        // daun bergoyang di atas batang tumbang
        for (var sl = 0; sl < 3; sl++) {
          var sleaf = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 5), mat(0x2f4530));
          sleaf.position.set(-0.8 + sl * 0.8, 0.85, 0);
          g.add(sleaf);
          swayLeaves.push(sleaf);
        }
      }
      g.position.set(c.x, 0, c.z);
      scene.add(g);
      hideMeshes[c.id] = g;
    });

    // ---- Rak bambu tinggi (lampion) + peti bambu yang bisa didorong ----
    box(0.12, 1.7, 0.12, 0x5a4630, 17.3, 0.85, 0);
    box(0.12, 1.7, 0.12, 0x5a4630, 18.3, 0.85, 0);
    box(1.4, 0.08, 0.5, 0x6b5233, 17.8, 1.7, 0);
    var crateMesh = new THREE.Group();
    var crateBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1.0), mat(0x6b5233));
    crateBody.position.y = 0.4;
    crateMesh.add(crateBody);
    var slat1 = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.06, 0.2), mat(0x4a3826));
    slat1.position.set(0, 0.82, -0.25);
    crateMesh.add(slat1);
    var slat2 = slat1.clone(); slat2.position.z = 0.25;
    crateMesh.add(slat2);
    crateMesh.position.set(L.CRATE.x, 0, 0);
    scene.add(crateMesh);

    // ---- Punden tua (besar): undakan batu + gapura + batu sesajen ----
    box(2.4, 0.3, 1.8, 0x555550, 26, 0.15, 0);
    box(1.8, 0.3, 1.4, 0x5d5d58, 26, 0.45, 0);
    box(0.3, 2.2, 0.3, 0x4a4a45, 25.2, 1.4, 0);
    box(0.3, 2.2, 0.3, 0x4a4a45, 26.8, 1.4, 0);
    box(2.0, 0.3, 0.4, 0x4a4a45, 26, 2.6, 0);
    box(0.5, 0.9, 0.4, 0x606058, 26, 1.05, 0);
    box(0.7, 0.12, 0.5, 0x3a3a35, 26, 0.66, 0); // nampan sesajen

    // ---- Gerbang desa (barat): tiang bambu besar + lengkung + lampion gantung ----
    [-1.2, 1.2].forEach(function (z) {
      var pil = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 4, 7), mat(0x3a4a2a));
      pil.position.set(-29.5, 2, z);
      scene.add(pil);
    });
    box(0.25, 0.3, 3.0, 0x4a3826, -29.5, 4.1, 0);
    var gateLamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff8844 }));
    gateLamp.position.set(-29.5, 3.6, 0);
    scene.add(gateLamp);
    // tali rafia menggantung di lengkung gerbang
    box(0.03, 1.0, 0.03, 0x8a7a52, -29.5, 3.5, -0.8);
    box(0.03, 0.8, 0.03, 0x8a7a52, -29.5, 3.6, 0.8);

    // sarang laba-laba di sudut gubuk (garis tipis)
    var webPts = [];
    var webC = [14.3, 2.0, -1.55]; // sudut atas gubuk
    for (var wi = 0; wi < 5; wi++) {
      var wa = wi * 0.5;
      webPts.push(webC[0], webC[1], webC[2]);
      webPts.push(webC[0] + Math.cos(wa) * 0.7, webC[1] - Math.sin(wa) * 0.7, webC[2]);
    }
    for (var wj = 1; wj <= 3; wj++) {
      var rr = wj * 0.22;
      for (var wk = 0; wk < 4; wk++) {
        var a1 = wk * 0.5, a2 = (wk + 1) * 0.5;
        webPts.push(webC[0] + Math.cos(a1) * rr, webC[1] - Math.sin(a1) * rr, webC[2]);
        webPts.push(webC[0] + Math.cos(a2) * rr, webC[1] - Math.sin(a2) * rr, webC[2]);
      }
    }
    var webGeo = new THREE.BufferGeometry();
    webGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(webPts), 3));
    var web = new THREE.LineSegments(webGeo,
      new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: 0.45 }));
    scene.add(web);

    // sesajen kecil di punden tua (mangkuk + bunga)
    [[25.7, -0.4], [26.3, 0.4], [26, -0.5]].forEach(function (sp) {
      var bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.06, 0.07, 8), mat(0x6a5a3a));
      bowl.position.set(sp[0], 0.64, sp[1]);
      scene.add(bowl);
      var fl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
      fl.position.set(sp[0], 0.7, sp[1]);
      scene.add(fl);
    });

    // batu lumut di tepi jalur
    [[-8, 2.3], [5, -2.3], [23, 2.3]].forEach(function (bp) {
      var ms = new THREE.Mesh(new THREE.SphereGeometry(0.32, 7, 5), mat(0x3a4438));
      ms.position.set(bp[0], 0.1, bp[1]);
      ms.scale.set(1.2, 0.45, 1);
      scene.add(ms);
    });

    // ---- Punden kecil + lilin (checkpoint) ----
    var candleMeshes = {};
    L.CANDLES.forEach(function (c) {
      box(0.7, 0.5, 0.5, 0x555550, c.x, 0.25, c.z);
      var g = new THREE.Group();
      var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.04, 10), mat(0x333333));
      plate.position.y = 0.02; g.add(plate);
      var stick = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.24, 8), mat(0xe8e0cc));
      stick.position.y = 0.16; g.add(stick);
      var flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.2, 8),
        new THREE.MeshBasicMaterial({ color: 0xffaa22 }));
      flame.position.y = 0.36; flame.visible = false; g.add(flame);
      g.position.set(c.x, 0.5, c.z);
      scene.add(g);
      candleMeshes[c.id] = { group: g, flame: flame };
    });

    // ---- Sesajen + baterai + penanda melayang ----
    function marker(color) {
      return new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshBasicMaterial({ color: color }));
    }
    var itemMeshes = {};
    L.ITEMS.forEach(function (it, idx) {
      var g = new THREE.Group();
      var mk = marker(0x66aaff);
      var markerY;
      if (it.id === 'melati') {
        // bunga melati putih kecil di tanah
        for (var p = 0; p < 3; p++) {
          var fl = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5),
            new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
          fl.position.set(-0.1 + p * 0.1, 0.12, (p % 2) * 0.08 - 0.04);
          g.add(fl);
        }
        box(0.04, 0.14, 0.04, 0x2a4a22, 0, 0.07, 0, g);
        markerY = 0.9;
      } else if (it.id === 'kemenyan') {
        // dupa kemenyan: 3 batang miring + wadah
        for (var k = 0; k < 3; k++) {
          var inc = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 5), mat(0x8a6a3a));
          inc.position.set(-0.08 + k * 0.08, 0.2, 0);
          inc.rotation.z = (k - 1) * 0.25;
          g.add(inc);
        }
        box(0.24, 0.08, 0.16, 0x3a3a35, 0, 0.04, 0, g);
        markerY = 0.9;
      } else {
        // lampion merah di rak tinggi
        var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), mat(0xcc4422));
        lamp.scale.set(1, 1.2, 1);
        lamp.position.y = 1.85;
        g.add(lamp);
        var glow = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff7733 }));
        glow.position.y = 1.85;
        g.add(glow);
        box(0.1, 0.05, 0.1, 0x3a2a1a, 0, 2.12, 0, g);
        markerY = 2.35;
      }
      mk.position.y = markerY; g.add(mk);
      g.position.set(it.x, 0, it.z);
      scene.add(g);
      itemMeshes[it.id] = { group: g, marker: mk, markerY: markerY, idx: idx };
    });
    var batteryMeshes = {};
    L.BATTERIES.forEach(function (b) {
      var g = new THREE.Group();
      var c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8), mat(0x2a8a3a));
      c.position.y = 0.1; g.add(c);
      var cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8),
        new THREE.MeshBasicMaterial({ color: 0xccffcc }));
      cap.position.y = 0.22; g.add(cap);
      g.position.set(b.x, 0, b.z);
      scene.add(g);
      batteryMeshes[b.id] = g;
    });

    // ---- Dimas: anak kecil berkepala sedikit besar, jas hujan kuning
    // berkerudung + lentera kecil di tangan kanan ----
    var YELLOW = 0xc9a227; // kuning redup ala Little Nightmares
    var dimas = new THREE.Group();
    var leanGroup = new THREE.Group();
    leanGroup.position.set(0, 0.24, 0);
    dimas.add(leanGroup);
    function limb(parent, w, h, d, color, x, y, z) {
      var pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      m.position.y = -h / 2;
      pivot.add(m);
      parent.add(pivot);
      return pivot;
    }
    // sepatu + kaki (di luar leanGroup: kaki tetap menapak)
    box(0.09, 0.05, 0.17, 0x1a1a1a, -0.06, 0.025, 0.02, dimas);
    box(0.09, 0.05, 0.17, 0x1a1a1a, 0.06, 0.025, 0.02, dimas);
    var legL = limb(dimas, 0.09, 0.22, 0.11, 0x3a3f4a, -0.06, 0.24, 0);
    var legR = limb(dimas, 0.09, 0.22, 0.11, 0x3a3f4a, 0.06, 0.24, 0);
    // jas hujan: kerucut terbalik (bawah mengembang)
    var coat = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.21, 0.42, 8), mat(YELLOW));
    coat.position.set(0, 0.20, 0);
    leanGroup.add(coat);
    var armL = limb(leanGroup, 0.08, 0.28, 0.09, YELLOW, -0.16, 0.36, 0);
    var armR = limb(leanGroup, 0.08, 0.28, 0.09, YELLOW, 0.16, 0.36, 0);
    // kepala sedikit besar + kerudung kuning
    var headPivot = new THREE.Group();
    headPivot.position.set(0, 0.48, 0);
    leanGroup.add(headPivot);
    var head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat(0xd8b89a));
    head.position.set(0, 0.10, 0);
    headPivot.add(head);
    var hood = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 8), mat(YELLOW));
    hood.position.set(0, 0.12, 0.02);
    hood.scale.set(1, 1.05, 1);
    headPivot.add(hood);
    // wajah mengintip dari kerudung (depan = -Z)
    [-0.05, 0.05].forEach(function (ex) {
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0x111111 }));
      eye.position.set(ex, 0.11, -0.135);
      headPivot.add(eye);
    });
    // lentera kecil di tangan kanan (ikut berayun)
    var lanternGroup = new THREE.Group();
    lanternGroup.position.set(0, -0.30, 0.03);
    armR.add(lanternGroup);
    var lframe = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.07), mat(0x2a2018));
    lanternGroup.add(lframe);
    var lglow = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffc06a }));
    lanternGroup.add(lglow);
    scene.add(dimas);

    // ---- Kuntilanak: siluet putih melayang, rambut hitam panjang menutupi wajah ----
    var kunti = new THREE.Group();
    var kuntiMats = [];
    function kmat(color) {
      var m = new THREE.MeshLambertMaterial({ color: color, transparent: true });
      kuntiMats.push(m);
      return m;
    }
    // gaun putih menjuntai (tanpa kaki: melayang)
    var dress = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.5, 8), kmat(0xd8d8d0));
    dress.position.y = 0.75;
    kunti.add(dress);
    var torso = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.5, 8), kmat(0xd8d8d0));
    torso.position.y = 1.55;
    kunti.add(torso);
    // lengan panjang menjuntai
    function kArm(x) {
      var pivot = new THREE.Group();
      pivot.position.set(x, 1.72, 0);
      var m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), kmat(0xd8d8d0));
      m.position.y = -0.35;
      pivot.add(m);
      kunti.add(pivot);
      return pivot;
    }
    var kArmL = kArm(-0.2), kArmR = kArm(0.2);
    // kepala pucat + rambut hitam panjang menutupi wajah
    var kHead = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), kmat(0xcfc4b8));
    kHead.position.y = 1.92;
    kunti.add(kHead);
    var hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), kmat(0x050505));
    hairBack.scale.set(1, 1.4, 1);
    hairBack.position.set(0, 1.95, 0.04);
    kunti.add(hairBack);
    // tirai rambut di depan wajah (depan = -Z)
    var hairFront = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.05), kmat(0x050505));
    hairFront.position.set(0, 1.85, -0.13);
    kunti.add(hairFront);
    // untaian rambut menjuntai sampai pinggang
    [-0.11, 0.11].forEach(function (sx) {
      var strand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 0.04), kmat(0x050505));
      strand.position.set(sx, 1.45, -0.14);
      kunti.add(strand);
    });
    // mata merah samar di balik rambut
    [-0.05, 0.05].forEach(function (ex) {
      var eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xff2211 }));
      eye.position.set(ex, 1.9, -0.165);
      kunti.add(eye);
    });
    scene.add(kunti);

    return {
      scene: scene, camera: camera, lantern: lantern, candleLight: candleLight,
      moonLight: moonLight,
      dimas: dimas, leanGroup: leanGroup, coat: coat,
      legL: legL, legR: legR, armL: armL, armR: armR,
      headPivot: headPivot, lanternGroup: lanternGroup,
      kunti: kunti, kArmL: kArmL, kArmR: kArmR, kuntiMats: kuntiMats,
      itemMeshes: itemMeshes, batteryMeshes: batteryMeshes,
      candleMeshes: candleMeshes, hideMeshes: hideMeshes,
      hideRims: hideRims, swayLeaves: swayLeaves,
      crateMesh: crateMesh, gateLamp: gateLamp,
      fireflies: fireflies, ffBase: ffBase, ffPhase: ffPhase,
      leaves: leaves, lfBase: lfBase, lfPhase: lfPhase,
      dust: dust, burst: burst, spawnBurst: spawnBurst, spawnInto: spawnInto, updatePool: updatePool,
      fogPlanes: fogPlanes, glowDisc: glowDisc,
      parallax: parallax, moon: moon, halo: halo, stars: stars,
      camX: -18, walkPhase: 0, reachT: 0, prevStepSin: 0, onStep: null
    };
  }

  // ---------- Sinkronisasi view dari state logika ----------
  function syncWorld(w, g, dt, time) {
    var p = g.player, e = g.enemy;

    // Kamera samping tetap: mengikuti pemain di sumbu X dengan lerp halus
    // (lag pelan ala Little Nightmares), sedikit goyangan saat lari.
    // Di menu utama, kamera menyapu hutan perlahan (latar menu yang hidup).
    var targetCamX = Math.max(-18, Math.min(18, p.x));
    if (g.state === 'menu') targetCamX = Math.sin(time * 0.05) * 10;
    if (w.camX === undefined || w.camX === null) w.camX = targetCamX;
    w.camX += (targetCamX - w.camX) * (1 - Math.exp(-dt * 3));
    var moving = (g.input.f !== 0 || g.input.s !== 0) && !p.hidden;
    var running = moving && g.input.run;
    var chasing = !!g.chaseWarn;
    var swayY = running ? Math.sin(time * 9) * 0.06 : Math.sin(time * 1.2) * 0.015;
    var swayX = running ? Math.sin(time * 9) * 0.08 : 0;
    w.camera.position.set(w.camX + swayX, 2.1 + swayY, 11);
    w.camera.lookAt(w.camX + swayX, 1.0, 0);

    // Parallax: lapisan siluet bambu latar bergerak lebih lambat dari kamera.
    w.parallax.forEach(function (ly) { ly.group.position.x = w.camX * ly.k; });
    w.moon.position.x = -16 + w.camX * 0.9;
    w.halo.position.x = w.moon.position.x;
    w.stars.position.x = w.camX * 0.9;
    // cahaya bulan berkedip sangat halus; kabut bergerak pelan
    w.moonLight.intensity = 0.3 + Math.sin(time * 0.7) * 0.02;
    w.fogPlanes.forEach(function (fp) {
      fp.mesh.position.x = w.camX * fp.k + Math.sin(time * 0.05 + fp.phase) * 3;
    });

    // ---- Dimas: animasi jalan/lari/diam/sembunyi/meraih/mendorong ----
    // Saat bersembunyi: merunduk/merangkak masuk ke lubang terdekat.
    if (p.hidden) {
      var hs = null; var hd = 99;
      for (var hi = 0; hi < L.HIDING.length; hi++) {
        var dd = Math.sqrt(Math.pow(p.x - L.HIDING[hi].x, 2) + Math.pow(p.z - L.HIDING[hi].z, 2));
        if (dd < hd) { hd = dd; hs = L.HIDING[hi]; }
      }
      if (hs) w.dimas.position.set(p.x * 0.7 + hs.x * 0.3, 0, p.z * 0.7 + hs.z * 0.3);
      else w.dimas.position.set(p.x, 0, p.z);
    } else {
      w.dimas.position.set(p.x, 0, p.z);
    }
    // tepi cahaya redup tempat sembunyi berdenyut pelan (menarik mata pemain)
    for (var ri = 0; ri < w.hideRims.length; ri++) {
      w.hideRims[ri].opacity = 0.45 + Math.sin(time * 2 + ri * 2.1) * 0.2;
    }
    // daun di bambu tumbang bergoyang ditiup angin
    for (var si = 0; si < w.swayLeaves.length; si++) {
      w.swayLeaves[si].rotation.z = Math.sin(time * 1.3 + si * 1.7) * 0.15;
    }
    w.dimas.rotation.y = p.yaw;
    if (moving) w.walkPhase += dt * (running ? 11 : 7);
    // deteksi langkah kaki (tiap pergantian ayunan): debu kecil + suara langkah
    var curSin = Math.sin(w.walkPhase);
    if (moving && ((w.prevStepSin <= 0 && curSin > 0) || (w.prevStepSin >= 0 && curSin < 0))) {
      w.spawnInto(w.dust, p.x, 0.05, p.z, running ? 3 : 2, { life: 0.5, spread: 0.5, up: 0.35 });
      if (w.onStep) { try { w.onStep(running); } catch (e) { /* abaikan */ } }
    }
    w.prevStepSin = curSin;
    var sw = moving ? Math.sin(w.walkPhase) : 0;
    // kaki: ayunan langkah kecil-kecil
    w.legL.rotation.x = sw * (running ? 0.8 : 0.55);
    w.legR.rotation.x = -sw * (running ? 0.8 : 0.55);
    // lengan
    if (g.pushing) {
      // mendorong peti: kedua lengan ke depan, badan condong
      w.armL.rotation.x = 1.2; w.armR.rotation.x = 1.2;
      w.armL.rotation.z = 0; w.armR.rotation.z = 0;
    } else if (running) {
      // lari: lengan sedikit terangkat ke samping (panik)
      w.armL.rotation.x = -sw * 0.3; w.armR.rotation.x = sw * 0.3;
      w.armL.rotation.z = 0.55; w.armR.rotation.z = -0.55;
    } else if (moving) {
      w.armL.rotation.x = -sw * 0.45; w.armR.rotation.x = sw * 0.45;
      w.armL.rotation.z = 0.08; w.armR.rotation.z = -0.08;
    } else {
      w.armL.rotation.x = 0; w.armR.rotation.x = 0;
      w.armL.rotation.z = 0.08; w.armR.rotation.z = -0.08;
    }
    // meraih/mengangkat tangan saat mengambil barang (0,6 detik)
    if (w.reachT > 0) {
      w.reachT -= dt;
      var rt = 1 - Math.max(0, w.reachT) / 0.6;
      w.armR.rotation.x = Math.sin(rt * Math.PI) * 2.2;
    }
    // badan condong ke depan saat lari / mendorong; merunduk saat sembunyi
    var lean = 0;
    if (p.hidden) lean = -0.25;
    else if (g.pushing) lean = -0.15;
    else if (running) lean = chasing ? -0.26 : -0.18;
    else if (moving) lean = -0.06;
    w.leanGroup.rotation.x += (lean - w.leanGroup.rotation.x) * Math.min(1, dt * 8);
    // badan naik-turun pelan (bob) saat berjalan
    var bob = moving ? Math.abs(Math.sin(w.walkPhase)) * (running ? 0.06 : 0.035) : 0;
    w.dimas.position.y = p.hidden ? 0 : bob;
    // napas naik-turun saat diam
    if (!moving && !p.hidden) {
      var br = 1 + Math.sin(time * 1.5) * 0.015;
      w.coat.scale.set(1, br, 1);
    } else {
      w.coat.scale.set(1, 1, 1);
    }
    // kepala: menoleh sesekali saat diam; melirik ke belakang saat dikejar
    var headTarget = 0;
    if (chasing && moving) headTarget = Math.sin(time * 2.2) * 0.9;
    else if (!moving && !p.hidden) headTarget = Math.sin(time * 0.4) * 0.5 * (0.5 + 0.5 * Math.sin(time * 0.11));
    w.headPivot.rotation.y += (headTarget - w.headPivot.rotation.y) * Math.min(1, dt * 5);
    // lentera di tangan ikut berayun saat berjalan
    w.lanternGroup.rotation.x = moving ? Math.sin(w.walkPhase) * 0.4 : Math.sin(time * 1.2) * 0.06;
    // sembunyi: jongkok/merunduk di rumpun bambu (tetap terlihat, merunduk)
    w.dimas.scale.y = p.hidden ? 0.6 : 1;
    w.dimas.visible = true;

    // ---- Kuntilanak: melayang + muncul perlahan dari kabut ----
    w.kunti.position.set(e.x, 0.32 + Math.sin(time * 1.8) * 0.12, e.z);
    w.kunti.rotation.y = e.yaw;
    w.kunti.rotation.x = chasing ? 0.14 : 0.05;
    w.kArmL.rotation.x = 0.25 + Math.sin(time * 1.8) * 0.12;
    w.kArmR.rotation.x = 0.25 + Math.sin(time * 1.8 + 1) * 0.12;
    // makin dekat makin jelas; jauh = samar di kabut
    var kd = Math.sqrt(Math.pow(e.x - p.x, 2) + Math.pow(e.z - p.z, 2));
    var kop = Math.max(0.3, Math.min(1, 1.3 - kd / 11));
    w.kuntiMats.forEach(function (m) { m.opacity = kop; });

    // ---- Peti bambu mengikuti logika ----
    w.crateMesh.position.x = g.crate.x;

    // ---- Kunang-kunang berpendar pelan ----
    var ffp = w.fireflies.geometry.attributes.position;
    for (var fi = 0; fi < w.ffBase.length; fi++) {
      var b = w.ffBase[fi], ph = w.ffPhase[fi];
      ffp.array[fi * 3] = b[0] + Math.sin(time * 0.7 + ph) * 0.3;
      ffp.array[fi * 3 + 1] = b[1] + Math.sin(time * 1.3 + ph) * 0.25;
      ffp.array[fi * 3 + 2] = b[2] + Math.cos(time * 0.5 + ph) * 0.2;
    }
    ffp.needsUpdate = true;

    // ---- Daun bambu jatuh melayang (jatuh pelan, kembali ke atas) ----
    var lfp = w.leaves.geometry.attributes.position;
    for (var li = 0; li < w.lfBase.length; li++) {
      var lb = w.lfBase[li], lph = w.lfPhase[li];
      var ly = lb[1] - ((time * 0.35 + lph) % 7);
      if (ly < 0.05) ly += 7;
      lfp.array[li * 3] = lb[0] + Math.sin(time * 0.6 + lph) * 0.6;
      lfp.array[li * 3 + 1] = ly;
      lfp.array[li * 3 + 2] = lb[2] + Math.cos(time * 0.4 + lph) * 0.3;
    }
    lfp.needsUpdate = true;

    // ---- Debu langkah + percikan sesajen ----
    w.updatePool(w.dust, dt, 0.3);
    w.updatePool(w.burst, dt, -1.5);

    // ---- Sesajen & baterai ----
    Object.keys(w.itemMeshes).forEach(function (id) {
      var im = w.itemMeshes[id];
      im.group.visible = !g.items[id];
      im.marker.position.y = im.markerY + Math.sin(time * 2 + im.idx * 1.7) * 0.12;
    });
    Object.keys(w.batteryMeshes).forEach(function (id) {
      w.batteryMeshes[id].visible = !g.batteries[id];
    });

    // ---- Lilin + cahaya lilin terdekat ----
    var nearest = null, nd = 7;
    Object.keys(w.candleMeshes).forEach(function (id) {
      var lit = !!g.candles[id];
      var cm = w.candleMeshes[id];
      cm.flame.visible = lit;
      if (lit) {
        cm.flame.scale.set(1, 1 + Math.sin(time * 13 + id.length) * 0.15, 1);
        var c = null;
        for (var i = 0; i < L.CANDLES.length; i++) if (L.CANDLES[i].id === id) c = L.CANDLES[i];
        if (c) {
          var d = Math.sqrt(Math.pow(p.x - c.x, 2) + Math.pow(p.z - c.z, 2));
          if (d < nd) { nd = d; nearest = c; }
        }
      }
    });
    if (nearest) {
      w.candleLight.position.set(nearest.x, 0.9, nearest.z);
      w.candleLight.intensity = 1.0;
    } else {
      w.candleLight.intensity = 0;
    }

    // ---- Lentera: dari tangan Dimas, mengarah ke dalam hutan ----
    // Cahaya berkedip halus (flicker) + pantulan hangat di tanah basah.
    var flick = 1 + Math.sin(time * 11) * 0.05 + Math.sin(time * 23) * 0.03;
    w.glowDisc.position.set(p.x, 0.02, p.z);
    w.glowDisc.material.opacity = g.flashlight ? (0.10 + (flick - 1) * 0.4) : 0;
    w.lantern.visible = !!g.flashlight;
    if (g.flashlight) {
      var dim = p.hidden ? 0.35 : 1; // merunduk = lentera ikut meredup
      w.lantern.position.set(p.x, 1.1, p.z + 0.4);
      w.lantern.intensity = 2.6 * dim * flick;
      w.lantern.target.position.set(p.x, 0.4, p.z - 7);
      w.lantern.target.updateMatrixWorld();
    }

    // ---- Lampion gerbang berdenyut saat kejar-kejaran final ----
    if (g.finalChase) {
      var s = 1 + Math.sin(time * 4) * 0.25;
      w.gateLamp.scale.set(s, s, s);
    } else {
      w.gateLamp.scale.set(1, 1, 1);
    }
  }

  // ---------- Wajah jumpscare Kuntilanak (digambar prosedural di canvas 2D, orisinil) ----------
  function drawScareFace(canvas) {
    if (!canvas || typeof canvas.getContext !== 'function') return false;
    var ctx = canvas.getContext('2d');
    if (!ctx) return false;
    var W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    // vignette merah
    var vg = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, 420);
    if (vg && vg.addColorStop) {
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(120,0,0,0.55)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }
    var cx = W / 2;
    // massa rambut hitam besar membingkai wajah
    ctx.fillStyle = '#050505';
    ctx.beginPath();
    ctx.moveTo(cx - 150, 640);
    ctx.bezierCurveTo(cx - 190, 300, cx - 150, 110, cx, 90);
    ctx.bezierCurveTo(cx + 150, 110, cx + 190, 300, cx + 150, 640);
    ctx.lineTo(cx + 90, 640);
    ctx.bezierCurveTo(cx + 110, 380, cx + 70, 200, cx, 190);
    ctx.bezierCurveTo(cx - 70, 200, cx - 110, 380, cx - 90, 640);
    ctx.closePath();
    ctx.fill();
    // wajah pucat memanjang di balik rambut
    var fg = ctx.createRadialGradient(cx - 20, 260, 20, cx, 320, 200);
    if (fg && fg.addColorStop) {
      fg.addColorStop(0, '#d8cfc0');
      fg.addColorStop(0.7, '#a89e8c');
      fg.addColorStop(1, '#55503f');
      ctx.fillStyle = fg;
    } else ctx.fillStyle = '#a89e8c';
    ctx.beginPath();
    ctx.moveTo(cx - 92, 300);
    ctx.bezierCurveTo(cx - 104, 190, cx - 62, 130, cx, 128);
    ctx.bezierCurveTo(cx + 62, 130, cx + 104, 190, cx + 92, 300);
    ctx.bezierCurveTo(cx + 84, 410, cx + 48, 500, cx, 520);
    ctx.bezierCurveTo(cx - 48, 500, cx - 84, 410, cx - 92, 300);
    ctx.fill();
    // untaian rambut menutupi sebagian wajah
    ctx.strokeStyle = 'rgba(5,5,5,0.9)';
    ctx.lineWidth = 9;
    [[-70, 150, -50, 330], [-30, 140, -18, 300], [25, 140, 40, 320], [70, 155, 55, 340]].forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(cx + s[0], s[1]);
      ctx.quadraticCurveTo(cx + s[0] + 14, (s[1] + s[3]) / 2, cx + s[2], s[3]);
      ctx.stroke();
    });
    // rongga mata hitam + mata merah menyala
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx - 42, 290, 36, 48, 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 42, 290, 36, 48, -0.08, 0, Math.PI * 2); ctx.fill();
    function eye(x, y) {
      var g = ctx.createRadialGradient(x, y, 2, x, y, 40);
      if (g && g.addColorStop) {
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.25, '#ff5544');
        g.addColorStop(0.6, 'rgba(255,30,10,0.55)');
        g.addColorStop(1, 'rgba(255,30,10,0)');
        ctx.fillStyle = g;
      } else ctx.fillStyle = '#ff2211';
      ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    eye(cx - 42, 290);
    eye(cx + 42, 290);
    // hidung: dua celah
    ctx.fillStyle = '#1a1512';
    ctx.beginPath(); ctx.ellipse(cx - 10, 372, 6, 12, 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 10, 372, 6, 12, -0.2, 0, Math.PI * 2); ctx.fill();
    // mulut gelap menganga memanjang + gigi
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, 462, 34, 72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#8a8072'; ctx.lineWidth = 3;
    for (var i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(cx + i * 13, 398);
      ctx.lineTo(cx + i * 12, 422);
      ctx.stroke();
    }
    // retakan pucat di pipi
    ctx.strokeStyle = 'rgba(40,32,24,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 78, 250); ctx.lineTo(cx - 52, 300); ctx.lineTo(cx - 68, 350); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 82, 260); ctx.lineTo(cx + 56, 310); ctx.lineTo(cx + 72, 360); ctx.stroke();
    return true;
  }

  // ---------- Save / Settings (localStorage; jalan di web & NW.js) ----------
  // localStorage tidak ada di Node/vm: semua akses dijaga try/catch.
  var SAVE_KEY = 'bayangKuntilanakSaveV1';
  var SETTINGS_KEY = 'bayangKuntilanakSettingsV1';
  // Volume: 0 Mati / 1 Pelan / 2 Sedang / 3 Keras
  var VOL = [0, 0.35, 0.7, 1];
  function lsGet(key) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return null;
      return localStorage.getItem(key);
    } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try {
      if (typeof localStorage === 'undefined' || !localStorage) return false;
      localStorage.setItem(key, val);
      return true;
    } catch (e) { return false; }
  }
  function lsRemove(key) {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) localStorage.removeItem(key);
    } catch (e) { /* abaikan */ }
  }

  // ---------- Audio synth (WebAudio saja) ----------
  var AudioSys = {
    ctx: null, master: null, musicBus: null, sfxBus: null, drone: null, started: false,
    musicLevel: 2, sfxLevel: 2,
    ensure: function () {
      try {
        if (!this.ctx) {
          var AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
          if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.85;
          // dua bus terpisah supaya volume musik & efek bisa diatur sendiri
          this.musicBus = this.ctx.createGain();
          this.sfxBus = this.ctx.createGain();
          this.musicBus.connect(this.master);
          this.sfxBus.connect(this.master);
          this.master.connect(this.ctx.destination);
          this._applyVolumes();
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { /* audio opsional */ }
    },
    // level 0..3 (Mati/Pelan/Sedang/Keras); tersimpan juga sebelum ctx ada
    setVolumes: function (music, sfx) {
      if (typeof music === 'number') this.musicLevel = Math.max(0, Math.min(3, music | 0));
      if (typeof sfx === 'number') this.sfxLevel = Math.max(0, Math.min(3, sfx | 0));
      this._applyVolumes();
    },
    _applyVolumes: function () {
      try {
        if (this.musicBus) this.musicBus.gain.value = VOL[this.musicLevel];
        if (this.sfxBus) this.sfxBus.gain.value = VOL[this.sfxLevel];
      } catch (e) { /* abaikan */ }
    },
    startDrone: function () {
      try {
        if (!this.ctx || this.drone) return;
        var ctx = this.ctx;
        var g = ctx.createGain(); g.gain.value = 0.04;
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
        [55, 55.7, 110.3].forEach(function (f) {
          var o = ctx.createOscillator();
          o.type = 'sine'; o.frequency.value = f;
          o.connect(lp); o.start();
        });
        var lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
        var lg = ctx.createGain(); lg.gain.value = 0.02;
        lfo.connect(lg); lg.connect(g.gain); lfo.start();
        lp.connect(g); g.connect(this.musicBus);
        // desir bambu saat angin: noise loop lewat bandpass, membengkak pelan
        var nlen = Math.floor(ctx.sampleRate * 2);
        var nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
        var nd = nbuf.getChannelData(0);
        for (var i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
        var nsrc = ctx.createBufferSource(); nsrc.buffer = nbuf; nsrc.loop = true;
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
        var ng = ctx.createGain(); ng.gain.value = 0.015;
        var nlfo = ctx.createOscillator(); nlfo.frequency.value = 0.08;
        var nlg = ctx.createGain(); nlg.gain.value = 0.012;
        nlfo.connect(nlg); nlg.connect(ng.gain); nlfo.start();
        nsrc.connect(bp); bp.connect(ng); ng.connect(this.musicBus);
        nsrc.start();
        this.drone = { g: g };
        this.started = true;
      } catch (e) { /* abaikan */ }
    },
    // langkah kaki pelan (bunyi tanah + daun kering)
    step: function (run) {
      try {
        if (!this.ctx) return;
        var ctx = this.ctx, t = ctx.currentTime;
        var len = Math.floor(ctx.sampleRate * 0.07);
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ctx.createBufferSource(); src.buffer = buf;
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = run ? 500 : 350;
        var g = ctx.createGain(); g.gain.value = run ? 0.12 : 0.07;
        src.connect(lp); lp.connect(g); g.connect(this.sfxBus);
        src.start(t);
      } catch (e) { /* abaikan */ }
    },
    blip: function () {
      try {
        if (!this.ctx) return;
        var ctx = this.ctx, t = ctx.currentTime;
        [880, 1318].forEach(function (f, i) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t + i * 0.09);
          g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.09 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.25);
          o.connect(g); g.connect(AudioSys.sfxBus);
          o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.3);
        });
      } catch (e) { /* abaikan */ }
    },
    // denting gamelan pelan (nada pentatonik acak, volume kecil)
    bonang: function () {
      try {
        if (!this.ctx) return;
        var ctx = this.ctx, t = ctx.currentTime;
        var scale = [440, 495, 550, 587.33, 660, 733.33];
        var f = scale[Math.floor(Math.random() * scale.length)];
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        var o2 = ctx.createOscillator(), g2 = ctx.createGain();
        o2.type = 'sine'; o2.frequency.value = f * 2.76;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.02, t + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
        o.connect(g); g.connect(AudioSys.musicBus);
        o2.connect(g2); g2.connect(AudioSys.musicBus);
        o.start(t); o.stop(t + 1.5);
        o2.start(t); o2.stop(t + 0.9);
      } catch (e) { /* abaikan */ }
    },
    // cekikikan Kuntilanak: 3 nada tinggi cepat dengan vibrato + gema
    giggle: function () {
      try {
        if (!this.ctx) return;
        var ctx = this.ctx, t = ctx.currentTime;
        // rantai gema (delay 0,28 dtk, feedback) — dibuat sekali
        if (!this.echoIn) {
          this.echoIn = ctx.createGain();
          var delay = ctx.createDelay(1.0); delay.delayTime.value = 0.28;
          var fb = ctx.createGain(); fb.gain.value = 0.35;
          var wet = ctx.createGain(); wet.gain.value = 0.3;
          this.echoIn.connect(delay); delay.connect(fb); fb.connect(delay);
          delay.connect(wet); wet.connect(this.sfxBus);
        }
        var self = this;
        [1250, 980, 1420].forEach(function (f, i) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(f, t + i * 0.13);
          o.frequency.exponentialRampToValueAtTime(f * 0.82, t + i * 0.13 + 0.11);
          var vib = ctx.createOscillator(); vib.frequency.value = 30;
          var vg = ctx.createGain(); vg.gain.value = 60;
          vib.connect(vg); vg.connect(o.frequency);
          g.gain.setValueAtTime(0.0001, t + i * 0.13);
          g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.13 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.13 + 0.14);
          o.connect(g); g.connect(AudioSys.sfxBus);
          if (self.echoIn) g.connect(self.echoIn);
          o.start(t + i * 0.13); vib.start(t + i * 0.13);
          o.stop(t + i * 0.13 + 0.16); vib.stop(t + i * 0.13 + 0.16);
        });
      } catch (e) { /* abaikan */ }
    },
    thump: function (vol) {
      try {
        if (!this.ctx) return;
        var ctx = this.ctx, t = ctx.currentTime;
        [0, 0.16].forEach(function (off, i) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(72, t + off);
          o.frequency.exponentialRampToValueAtTime(38, t + off + 0.14);
          g.gain.setValueAtTime(0.0001, t + off);
          g.gain.exponentialRampToValueAtTime(vol * (i === 0 ? 1 : 0.6), t + off + 0.015);
          g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.18);
          o.connect(g); g.connect(AudioSys.sfxBus);
          o.start(t + off); o.stop(t + off + 0.22);
        });
      } catch (e) { /* abaikan */ }
    },
    sting: function () {
      // ledakan disonan + jeritan synth pendek (jumpscare)
      try {
        if (!this.ctx) return;
        var ctx = this.ctx, t = ctx.currentTime;
        var len = Math.floor(ctx.sampleRate * 0.5);
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var d = buf.getChannelData(0);
        for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        var src = ctx.createBufferSource(); src.buffer = buf;
        var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;
        var ng = ctx.createGain(); ng.gain.value = 0.7;
        src.connect(bp); bp.connect(ng); ng.connect(this.sfxBus);
        src.start(t);
        [110, 116.5, 220, 233, 311].forEach(function (f) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'sawtooth'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
          o.connect(g); g.connect(AudioSys.sfxBus);
          o.start(t); o.stop(t + 0.75);
        });
        var s = ctx.createOscillator(), sg = ctx.createGain();
        s.type = 'sawtooth';
        s.frequency.setValueAtTime(1250, t);
        s.frequency.exponentialRampToValueAtTime(280, t + 0.65);
        var vib = ctx.createOscillator(); vib.frequency.value = 28;
        var vg = ctx.createGain(); vg.gain.value = 90;
        vib.connect(vg); vg.connect(s.frequency); vib.start(t); vib.stop(t + 0.7);
        sg.gain.setValueAtTime(0.0001, t);
        sg.gain.exponentialRampToValueAtTime(0.3, t + 0.03);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
        s.connect(sg); sg.connect(this.sfxBus);
        s.start(t); s.stop(t + 0.72);
      } catch (e) { /* abaikan */ }
    },
    winJingle: function () {
      try {
        if (!this.ctx) return;
        var ctx = this.ctx, t = ctx.currentTime;
        [523, 659, 784, 1046].forEach(function (f, i) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t + i * 0.16);
          g.gain.exponentialRampToValueAtTime(0.22, t + i * 0.16 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.5);
          o.connect(g); g.connect(AudioSys.sfxBus);
          o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.55);
        });
      } catch (e) { /* abaikan */ }
    }
  };

  // ---------- Boot (browser) ----------
  function init() {
    if (typeof document === 'undefined' || !document.getElementById) return null;
    if (!THREE || !L) {
      var m = document.getElementById('menu');
      if (m) m.innerHTML = '<h2>Gagal memuat game</h2><p class="sub">Three.js atau logika game tidak termuat. Buka file index.html dari folder game yang lengkap.</p>';
      return null;
    }
    var $ = function (id) { return document.getElementById(id); };
    var canvas = $('game');
    var game = new L.Game();

    // ---- Pengaturan (localStorage, tetap berlaku setelah game ditutup) ----
    function loadSettings() {
      var d = { music: 2, sfx: 2, quality: 'high' };
      try {
        var raw = lsGet(SETTINGS_KEY);
        if (raw) {
          var s = JSON.parse(raw);
          if (s && typeof s.music === 'number') d.music = Math.max(0, Math.min(3, s.music | 0));
          if (s && typeof s.sfx === 'number') d.sfx = Math.max(0, Math.min(3, s.sfx | 0));
          if (s && (s.quality === 'low' || s.quality === 'high')) d.quality = s.quality;
        }
      } catch (e) { /* pengaturan rusak -> pakai default */ }
      return d;
    }
    var settings = loadSettings();
    function saveSettings() { lsSet(SETTINGS_KEY, JSON.stringify(settings)); }
    function setMusic(level) {
      settings.music = Math.max(0, Math.min(3, level | 0));
      AudioSys.setVolumes(settings.music, settings.sfx);
      saveSettings(); refreshOptionsUI();
    }
    function setSfx(level) {
      settings.sfx = Math.max(0, Math.min(3, level | 0));
      AudioSys.setVolumes(settings.music, settings.sfx);
      saveSettings(); refreshOptionsUI();
    }
    function setQuality(q) {
      if (q !== 'low' && q !== 'high') return;
      settings.quality = q;
      saveSettings(); applyQuality(); refreshOptionsUI();
    }
    function applyQuality() {
      var low = settings.quality === 'low';
      if (renderer) {
        try {
          renderer.setPixelRatio(low ? 1 :
            Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 1.5));
        } catch (e) { /* abaikan */ }
      }
      // kualitas rendah: matikan efek partikel (kunang-kunang, daun jatuh,
      // debu, percikan) + kabut bergerak — untuk HP kentang
      var vis = !low;
      if (world) {
        if (world.fireflies) world.fireflies.visible = vis;
        if (world.leaves) world.leaves.visible = vis;
        if (world.dust && world.dust.points) world.dust.points.visible = vis;
        if (world.burst && world.burst.points) world.burst.points.visible = vis;
        if (world.fogPlanes) world.fogPlanes.forEach(function (fp) { if (fp.mesh) fp.mesh.visible = vis; });
      }
    }
    function applySettings() {
      AudioSys.setVolumes(settings.music, settings.sfx);
      applyQuality();
    }

    // ---- Save / Load (autosave di tiap checkpoint lilin + sesajen) ----
    function hasSave() { return !!lsGet(SAVE_KEY); }
    function saveGame() {
      try {
        if (game.state !== 'playing' && game.state !== 'paused') return false;
        var data = game.toSave();
        data.savedAt = Date.now();
        return lsSet(SAVE_KEY, JSON.stringify(data));
      } catch (e) { return false; }
    }
    function loadGame() {
      try {
        var raw = lsGet(SAVE_KEY);
        if (!raw) return false;
        var data = JSON.parse(raw);
        return !!game.fromSave(data);
      } catch (e) { return false; }
    }

    var world = buildWorld(THREE, L);
    var renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setPixelRatio(settings.quality === 'low' ? 1 :
        Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 1.5));
      renderer.setClearColor(0x05070c, 1);
    } catch (e) { renderer = null; }

    var els = {
      menu: $('menu'), pauseMenu: $('pauseMenu'), overMenu: $('overMenu'), winMenu: $('winMenu'),
      optionsMenu: $('optionsMenu'), confirmMenu: $('confirmMenu'), saveInfo: $('saveInfo'),
      hud: $('hud'), hearts: $('hearts'), batfill: $('batfill'), items: $('items'),
      msg: $('msg'), warn: $('warn'), timer: $('timer'), touch: $('touch'),
      rotate: $('rotate'), jumpscare: $('jumpscare'), scareFace: $('scareFace'),
      winText: $('winText'), fade: $('fade')
    };

    // langkah kaki: syncWorld memanggil hook ini tiap langkah Dimas
    world.onStep = function (run) {
      try { AudioSys.ensure(); AudioSys.step(run); } catch (e) { /* abaikan */ }
    };

    // gambar wajah jumpscare sekali di awal
    drawScareFace(els.scareFace);

    var isTouch = (typeof window !== 'undefined') &&
      (('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0));
    if (isTouch && els.touch) els.touch.style.display = 'block';

    // ---- Jumpscare ----
    var SCARE_MS = 800, SCARE_COOLDOWN_MS = 3000;
    var lastScare = 0, scareUntil = 0, scareTimer = null;
    function hideScare() {
      if (els.jumpscare) els.jumpscare.classList.remove('on');
    }
    function triggerJumpscare() {
      var now = Date.now();
      if (now - lastScare < SCARE_COOLDOWN_MS) return false;
      lastScare = now;
      scareUntil = now + SCARE_MS;
      if (els.jumpscare) els.jumpscare.classList.add('on');
      try { AudioSys.ensure(); AudioSys.sting(); } catch (e) { /* abaikan */ }
      if (scareTimer) clearTimeout(scareTimer);
      scareTimer = setTimeout(hideScare, SCARE_MS);
      return true;
    }
    function scareActive() { return Date.now() < scareUntil; }

    // ---- Landscape: tahan game saat portrait di HP ----
    var pausedByRotate = false;
    function checkOrientation() {
      if (!els.rotate || !isTouch || typeof window === 'undefined') return;
      var portrait = window.innerHeight > window.innerWidth;
      if (portrait) {
        els.rotate.style.display = 'flex';
        if (game.state === 'playing') { game.pause(); pausedByRotate = true; showPause(); }
      } else {
        els.rotate.style.display = 'none';
        if (pausedByRotate && game.state === 'paused') {
          pausedByRotate = false;
          game.resume(); hideMenus();
        }
      }
    }

    function resize() {
      if (typeof window === 'undefined') return;
      var vw = window.innerWidth, vh = window.innerHeight;
      var scale = Math.min(vw / 1280, vh / 720);
      canvas.style.width = Math.floor(1280 * scale) + 'px';
      canvas.style.height = Math.floor(720 * scale) + 'px';
      if (renderer) {
        renderer.setSize(1280, 720, false);
        world.camera.aspect = 1280 / 720;
        world.camera.updateProjectionMatrix();
      }
      checkOrientation();
    }

    function showMenu(id) {
      [els.menu, els.pauseMenu, els.overMenu, els.winMenu, els.optionsMenu, els.confirmMenu].forEach(function (el) {
        if (el) el.classList.add('hidden');
      });
      if (id && els[id]) els[id].classList.remove('hidden');
    }
    function hideMenus() { showMenu(null); }
    function showPause() { showMenu('pauseMenu'); }
    // tombol LOAD GAME nonaktif (abu-abu) kalau belum ada save
    function refreshMenuButtons() {
      var loadBtn = $('btnLoad');
      var has = hasSave();
      if (loadBtn) {
        loadBtn.disabled = !has;
        loadBtn.classList.toggle('disabled', !has);
      }
      if (els.saveInfo) {
        if (has) {
          var when = '';
          try {
            var d = JSON.parse(lsGet(SAVE_KEY));
            if (d && d.savedAt) when = ' — ' + new Date(d.savedAt).toLocaleString('id-ID');
          } catch (e) { /* abaikan */ }
          els.saveInfo.textContent = 'Save terakhir tersimpan' + when + '.';
        } else {
          els.saveInfo.textContent = 'Belum ada save — selesaikan satu checkpoint lilin atau ambil sesajen, game menyimpan otomatis.';
        }
      }
    }
    // tandai pilihan aktif di menu options
    function refreshOptionsUI() {
      var i, el;
      for (i = 0; i < 4; i++) {
        el = $('optMusic' + i); if (el) el.classList.toggle('on', settings.music === i);
        el = $('optSfx' + i); if (el) el.classList.toggle('on', settings.sfx === i);
      }
      el = $('optQualityHigh'); if (el) el.classList.toggle('on', settings.quality === 'high');
      el = $('optQualityLow'); if (el) el.classList.toggle('on', settings.quality === 'low');
    }
    // menu options bisa dibuka dari menu utama atau dari pause
    var optionsReturn = 'menu';
    function openOptions(from) {
      optionsReturn = from || 'menu';
      showMenu('optionsMenu');
      refreshOptionsUI();
    }
    function startNewGame() {
      lsRemove(SAVE_KEY); // save lama ditimpa (sudah dikonfirmasi)
      if (els.fade) els.fade.style.opacity = '0';
      game.start();
      hideMenus();
    }
    function updateHUD() {
      if (!els.hud) return;
      var on = game.state === 'playing' || game.state === 'paused';
      els.hud.classList.toggle('hidden', !on);
      els.timer.classList.toggle('hidden', !on);
      els.hearts.textContent = '♥'.repeat(Math.max(0, game.lives)) + '♡'.repeat(Math.max(0, 3 - game.lives));
      els.batfill.style.width = Math.round(game.battery) + '%';
      els.batfill.style.background = game.battery < 25 ? '#e05a4e' : '#d8b25c';
      els.items.innerHTML = 'Sesajen: ' + game.itemsGot + '/3<br>' +
        'Melati ' + (game.items.melati ? '☑' : '☐') + ' &nbsp;Kemenyan ' + (game.items.kemenyan ? '☑' : '☐') +
        ' &nbsp;Lampion ' + (game.items.lampion ? '☑' : '☐');
      els.timer.textContent = fmtTime(game.time);
      els.warn.classList.toggle('hidden', !game.chaseWarn || game.state !== 'playing');
      var near = game.state === 'playing' ? game.nearestInteractable() : null;
      if (near) {
        els.msg.textContent = near.label;
        els.msg.classList.remove('hidden');
      } else if (game.state === 'playing' && game.player.hidden) {
        els.msg.textContent = 'Bersembunyi... tekan E untuk keluar';
        els.msg.classList.remove('hidden');
      } else {
        els.msg.classList.add('hidden');
      }
    }

    // ---- Event logika -> suara / jumpscare / menu ----
    game.onEvent = function (type, data) {
      try { AudioSys.ensure(); } catch (e) { /* abaikan */ }
      // autosave: tiap checkpoint lilin menyala + tiap sesajen terambil
      if (type === 'pickup' || type === 'candle') saveGame();
      if (type === 'pickup') {
        AudioSys.blip();
        world.reachT = 0.6;
        try { world.spawnBurst(game.player.x, game.player.z); } catch (e) { /* abaikan */ }
      }
      else if (type === 'battery') AudioSys.blip();
      else if (type === 'candle') AudioSys.blip();
      else if (type === 'locked' || type === 'toohigh') AudioSys.blip();
      else if (type === 'chase') AudioSys.giggle();
      else if (type === 'caught') triggerJumpscare();
      else if (type === 'final') {
        game.placeEnemyAhead(2.2);
        AudioSys.giggle();
        triggerJumpscare();
      } else if (type === 'win') {
        AudioSys.winJingle();
        if (els.winText) els.winText.textContent =
          'Dimas keluar lewat gerbang desa dalam ' +
          fmtTime(game.finalTime) + '. Di belakangnya, hutan bambu kembali sunyi — Kuntilanak tenang di punden tua.';
        // transisi fade ke hitam, lalu menu menang
        if (els.fade) els.fade.style.opacity = '1';
        setTimeout(function () {
          showMenu('winMenu');
          if (els.fade) els.fade.style.opacity = '0';
        }, 650);
      }
      // 'gameover' ditangani di loop utama (menunggu jumpscare selesai)
    };

    // ---- Input keyboard + analog (digabung dalam SATU fungsi) ----
    // Pelajaran dari bug game sekolah: jangan pernah menimpa input analog
    // dengan input keyboard (0,0) sesudahnya. Satu-satunya jalur ke
    // game.setInput adalah fungsi ini, yang menjumlahkan keduanya.
    var keys = {};
    var touchRun = false;
    var joyVec = { x: 0, y: 0 };
    function applyKeys() {
      var kf = (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
      var ks = (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
      var jx = joyVec ? joyVec.x : 0;
      var jy = joyVec ? joyVec.y : 0;
      var f = kf - jy, s = ks + jx;
      var len = Math.sqrt(f * f + s * s);
      if (len > 1) { f /= len; s /= len; }
      game.setInput(f, s, !!(keys['ShiftLeft'] || keys['ShiftRight'] || touchRun));
    }
    function applyTouch() {
      // Cukup teruskan ke applyKeys(): input analog sudah digabung di sana.
      applyKeys();
    }
    function onKey(e, down) {
      keys[e.code] = down;
      if (!down) { applyKeys(); return; }
      if (e.code === 'KeyF') game.toggleFlashlight();
      else if (e.code === 'KeyE') game.tryInteract();
      else if (e.code === 'KeyP') {
        if (game.state === 'playing') { game.pause(); showPause(); }
        else if (game.state === 'paused') { game.resume(); hideMenus(); }
      } else if (e.code === 'Escape') {
        if (game.state === 'playing') { game.pause(); showPause(); }
      }
      applyKeys();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].indexOf(e.code) >= 0) e.preventDefault();
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', function (e) { onKey(e, true); });
      window.addEventListener('keyup', function (e) { onKey(e, false); });
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', function () { setTimeout(checkOrientation, 100); });
    }

    // ---- Kontrol sentuh (landscape; kamera samping tetap, tanpa menoleh) ----
    var joy = $('joy'), stick = $('stick');
    var joyId = null;
    function setStick(dx, dy) {
      if (!stick) return;
      stick.style.left = (44 + dx * 40) + 'px';
      stick.style.top = (44 + dy * 40) + 'px';
    }
    if (joy && joy.addEventListener) {
      joy.addEventListener('touchstart', function (e) {
        e.preventDefault();
        var t = e.changedTouches[0];
        joyId = t.identifier;
      }, { passive: false });
      joy.addEventListener('touchmove', function (e) {
        e.preventDefault();
        for (var i = 0; i < e.changedTouches.length; i++) {
          var t = e.changedTouches[i];
          if (t.identifier !== joyId) continue;
          var r = joy.getBoundingClientRect();
          var dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
          var dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
          var len = Math.sqrt(dx * dx + dy * dy);
          if (len > 1) { dx /= len; dy /= len; }
          joyVec.x = dx; joyVec.y = dy;
          setStick(dx, dy);
          applyTouch();
        }
      }, { passive: false });
      var joyEnd = function (e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === joyId) {
            joyId = null; joyVec.x = 0; joyVec.y = 0;
            setStick(0, 0);
            applyTouch();
          }
        }
      };
      joy.addEventListener('touchend', joyEnd);
      joy.addEventListener('touchcancel', joyEnd);
    }
    function bindBtn(id, down, up) {
      var el = $(id);
      if (!el || !el.addEventListener) return;
      el.addEventListener('touchstart', function (e) { e.preventDefault(); down(); }, { passive: false });
      if (up) {
        el.addEventListener('touchend', function (e) { e.preventDefault(); up(); }, { passive: false });
        el.addEventListener('touchcancel', function (e) { e.preventDefault(); up(); }, { passive: false });
      }
      el.addEventListener('click', function (e) { e.preventDefault(); down(); if (up) up(); });
    }
    bindBtn('btnLight', function () { game.toggleFlashlight(); });
    bindBtn('btnAct', function () { game.tryInteract(); });
    bindBtn('btnRun', function () { touchRun = true; applyKeys(); }, function () { touchRun = false; applyKeys(); });
    bindBtn('btnPause', function () {
      if (game.state === 'playing') { game.pause(); showPause(); }
      else if (game.state === 'paused') { game.resume(); hideMenus(); }
    });

    // ---- Tombol menu ----
    function bindClick(id, fn) {
      var el = $(id);
      if (el && el.addEventListener) el.addEventListener('click', fn);
    }
    // ---- Tombol menu utama (ala Little Nightmares) ----
    bindClick('btnStart', function () { // NEW GAME
      AudioSys.ensure(); AudioSys.startDrone();
      if (hasSave()) showMenu('confirmMenu'); // save lama? konfirmasi dulu
      else startNewGame();
    });
    bindClick('btnConfirmYes', function () { startNewGame(); });
    bindClick('btnConfirmNo', function () { showMenu('menu'); refreshMenuButtons(); });
    bindClick('btnLoad', function () { // LOAD GAME
      AudioSys.ensure(); AudioSys.startDrone();
      if (loadGame()) {
        if (els.fade) els.fade.style.opacity = '0';
        hideMenus();
      } else { showMenu('menu'); refreshMenuButtons(); }
    });
    bindClick('btnOptions', function () { openOptions('menu'); });
    bindClick('btnOptionsPause', function () { openOptions('pauseMenu'); });
    bindClick('btnOptionsBack', function () { showMenu(optionsReturn); });
    bindClick('optMusic0', function () { setMusic(0); });
    bindClick('optMusic1', function () { setMusic(1); });
    bindClick('optMusic2', function () { setMusic(2); });
    bindClick('optMusic3', function () { setMusic(3); });
    bindClick('optSfx0', function () { setSfx(0); });
    bindClick('optSfx1', function () { setSfx(1); });
    bindClick('optSfx2', function () { setSfx(2); });
    bindClick('optSfx3', function () { setSfx(3); });
    bindClick('optQualityHigh', function () { setQuality('high'); });
    bindClick('optQualityLow', function () { setQuality('low'); });
    bindClick('btnHow', function () {
      var h = $('howto');
      if (h) h.classList.toggle('hidden');
    });
    bindClick('btnResume', function () { game.resume(); hideMenus(); });
    bindClick('btnRestart1', function () { game.start(); hideMenus(); });
    bindClick('btnRestart2', function () { game.start(); hideMenus(); });
    bindClick('btnRestart3', function () { game.start(); hideMenus(); });
    bindClick('btnMenuPause', function () { game.toMenu(); showMenu('menu'); refreshMenuButtons(); });
    bindClick('btnMenu2', function () { game.toMenu(); showMenu('menu'); refreshMenuButtons(); });
    bindClick('btnMenu3', function () { game.toMenu(); showMenu('menu'); refreshMenuButtons(); });

    // ---- Loop utama ----
    var last = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var lastThump = 0, lastBonang = 0, lastGiggle = 0;
    var overShown = false;
    function loop(now) {
      var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      if (!scareActive()) {
        game.update(dt);
        if (game.state === 'gameover' && !overShown) {
          overShown = true;
          // transisi fade ke hitam, lalu menu game over
          if (els.fade) els.fade.style.opacity = '1';
          setTimeout(function () {
            showMenu('overMenu');
            if (els.fade) els.fade.style.opacity = '0';
          }, 650);
        }
        if (game.state !== 'gameover') overShown = false;
      }
      // render saat bermain DAN di menu utama (latar menu: hutan hidup)
      if (game.state === 'playing' || game.state === 'menu') {
        syncWorld(world, game, dt, now / 1000);
        // getar layar halus saat jumpscare aktif
        if (scareActive() && renderer) {
          world.camera.position.x += (Math.random() - 0.5) * 0.18;
          world.camera.position.y += (Math.random() - 0.5) * 0.12;
        }
        if (renderer) renderer.render(world.scene, world.camera);
      }
      if (game.state === 'playing') {
        // denting gamelan pelan sesekali
        if (now - lastBonang > 4500) { lastBonang = now; AudioSys.bonang(); }
        // cekikikan saat dikejar (berkala)
        if (game.chaseWarn && now - lastGiggle > 5000) { lastGiggle = now; AudioSys.giggle(); }
        if (game.chaseWarn && AudioSys.ctx) {
          var d = Math.sqrt(Math.pow(game.enemy.x - game.player.x, 2) + Math.pow(game.enemy.z - game.player.z, 2));
          var interval = Math.max(0.45, Math.min(1.1, 0.45 + d * 0.03));
          if (now - lastThump > interval * 1000) {
            lastThump = now;
            AudioSys.thump(0.5);
          }
        }
      }
      updateHUD();
      if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(loop);
    }

    // terapkan pengaturan tersimpan (volume + kualitas) & status tombol LOAD
    applySettings();
    refreshMenuButtons();

    resize();
    checkOrientation();
    if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(loop);

    var api = {
      game: game, world: world, renderer: renderer,
      buildWorld: buildWorld, syncWorld: syncWorld,
      countTriangles: countTriangles, drawScareFace: drawScareFace,
      triggerJumpscare: triggerJumpscare, scareActive: scareActive,
      checkOrientation: checkOrientation, fmtTime: fmtTime,
      settings: settings, AudioSys: AudioSys,
      loadSettings: loadSettings, saveSettings: saveSettings,
      applySettings: applySettings, applyQuality: applyQuality,
      setMusic: setMusic, setSfx: setSfx, setQuality: setQuality,
      hasSave: hasSave, saveGame: saveGame, loadGame: loadGame,
      startNewGame: startNewGame, openOptions: openOptions,
      showMenu: showMenu, hideMenus: hideMenus,
      refreshMenuButtons: refreshMenuButtons, refreshOptionsUI: refreshOptionsUI,
      SAVE_KEY: SAVE_KEY, SETTINGS_KEY: SETTINGS_KEY
    };
    if (typeof window !== 'undefined') window.__game = api;
    return api;
  }

  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // ekspor untuk pengujian Node (vm)
  if (typeof globalThis !== 'undefined') {
    globalThis.__BayangKuntilanakView = {
      buildWorld: buildWorld, syncWorld: syncWorld,
      countTriangles: countTriangles, drawScareFace: drawScareFace, fmtTime: fmtTime
    };
  }
})();
