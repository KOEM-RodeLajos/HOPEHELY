/* ============================================================
 * PehelyCore v63
 * Közös, DOM-független (offline-barát) algoritmusok a
 *   - Hópehely Generátor
 *   - HAVAZO
 * programokhoz.
 *
 * Használat:
 *   <script src="./pehely-core.js"></script>
 *   majd a HTML-ben: window.PehelyCore.<függvény>
 *
 * Cél: a közös geometria + kód/JPG-komment kezelés egyetlen helyen,
 *      hogy javításoknál ne kelljen két HTML-t külön frissíteni.
 * ============================================================ */
(function (global) {
  'use strict';

  // Namespace (globális) – modul import nélkül, hogy file:// alatt is működjön.
  const PehelyCore = {};

  // Verziók / konstansok
  PehelyCore.VERSION = 'v63';
  const DXF_TARGET_SIZE = 100.0; // mm – a modell max kiterjedése export előtt
  PehelyCore.DXF_TARGET_SIZE = DXF_TARGET_SIZE;

  /**
   * DXF BLOCK/INSERT név a PEHELY-kódból.
   *
   * Cél: a blokk neve legyen stabilan a kódhoz köthető (később visszakereshető),
   * de DXF-kompatibilis karakterkészletet használjon.
   *
   * Szabály: minden nem [0-9A-Za-z_] karakter '_' lesz.
   * (A kód jellemzően '-' és '.' karaktereket tartalmaz; ezeket '_' váltja.)
   */
  function blockNameFromCode(code) {
    const s = String(code || '');
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const isAZ = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
      const is09 = (ch >= '0' && ch <= '9');
      if (isAZ || is09 || ch === '_') out += ch;
      else out += '_';
    }
    out = out.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    return out || 'PEHELY';
  }
  PehelyCore.blockNameFromCode = blockNameFromCode;


function pointInPolygon(x, y, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect =
        ((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

function scalePolygon(poly, scale) {
    if (!poly || poly.length < 2 || scale === 1) return poly;
    const unique = poly.slice(0, poly.length - 1);
    if (!unique.length) return poly;

    let cx = 0, cy = 0;
    for (const [x, y] of unique) { cx += x; cy += y; }
    cx /= unique.length;
    cy /= unique.length;

    const scaled = unique.map(([x, y]) => [
      cx + (x - cx) * scale,
      cy + (y - cy) * scale
    ]);
    scaled.push(scaled[0].slice());
    return scaled;
  }

function paramsFromCode(codeString) {
    const parts = codeString.split('-');
    if (parts.length < 12) {
      throw new Error('Érvénytelen PEHELY kód: ' + codeString);
    }
    // ÚJ (v49): Lefutás kód (a Végforma után) – visszafelé kompatibilis.
    // Régi: angle-ratio-space-red-tip-tipScale-tipOnly-tipCenter-trunk-arms-minRect-grow
    // Új:   angle-ratio-space-red-tip-runoff-tipScale-tipOnly-tipCenter-trunk-arms-minRect-grow
    let angleStr, ratioStr, spaceStr, redStr;
    let tipCode, runoffCode, tipScaleStr, tipOnlyFlag, tipCenterFlag, trunkFlag, armsStr, minRectStr, growFlag;
    if (parts.length === 12) {
      [angleStr, ratioStr, spaceStr, redStr,
       tipCode, tipScaleStr, tipOnlyFlag, tipCenterFlag, trunkFlag,
       armsStr, minRectStr, growFlag] = parts;
      runoffCode = 'NE';
    } else {
      [angleStr, ratioStr, spaceStr, redStr,
       tipCode, runoffCode, tipScaleStr, tipOnlyFlag, tipCenterFlag, trunkFlag,
       armsStr, minRectStr, growFlag] = parts;
    }

    const angle   = parseFloat(angleStr) || 0;
    const ratio   = parseFloat(ratioStr) || 0;
    const spacing = parseFloat(spaceStr) || 0;
    const red     = parseFloat(redStr)   || 0;

    let tipMode = 0;
    if      (tipCode === '3S') tipMode = 1;
    else if (tipCode === 'YY') tipMode = 2;
    else if (tipCode === '6S') tipMode = 3;
    else if (tipCode === '4S') tipMode = 4;

    const tipScale   = parseFloat(tipScaleStr);
    const arms       = parseInt(armsStr, 10);
    const minRectMm  = parseFloat(minRectStr);

    
    const runoff = (function(code){
      switch ((code || '').toUpperCase()) {
        case 'PO': return '.oO';
        case 'NU': return 'ooo';
        case 'VA': return 'oOo';
        case 'NE':
        default:   return 'Oo.';
      }
    })(runoffCode);
return {
      branchAngleDeg:    angle,
      rectAspectPercent: ratio,
      spacingPercent:    spacing,
      reductionPercent:  red,
      tipMode,
      tipScale:          Number.isFinite(tipScale) ? tipScale : 1,
      tipOnly:           (tipOnlyFlag   === 'Y'),
      tipAtCenter:       (tipCenterFlag === 'Y'),
      showTrunk:         (trunkFlag     === 'Y'),
      armCount:          Number.isFinite(arms) ? arms : 6,
      minRectMm:         Number.isFinite(minRectMm) ? minRectMm : 0,
      growSmallRects:    (growFlag === 'Y'),
      runoff:            runoff
    };
  }

function buildCodeFromParams(p) {
    const angleStr   = Math.round(p.branchAngleDeg).toString();
    const ratioStr   = Math.round(p.rectAspectPercent).toString();
    const spacingStr = Math.round(p.spacingPercent).toString();
    const redStr     = Math.round(p.reductionPercent).toString();

    let tipCode = '0S';
    if      (p.tipMode === 1) tipCode = '3S';
    else if (p.tipMode === 2) tipCode = 'YY';
    else if (p.tipMode === 3) tipCode = '6S';
    else if (p.tipMode === 4) tipCode = '4S';

    // Lefutás kód (v48): a Végforma után
    const runoffCode = (function(mode){
      switch (mode) {
        case '.oO': return 'PO';
        case 'ooo': return 'NU';
        case 'oOo': return 'VA';
        case 'Oo.':
        default:    return 'NE';
      }
    })(p.runoff || 'Oo.');

    const tipScaleStr   = (Number.isFinite(p.tipScale) ? p.tipScale : 1.0).toFixed(2);
    const tipOnlyFlag   = p.tipOnly     ? 'Y' : 'N';
    const tipCenterFlag = p.tipAtCenter ? 'Y' : 'N';
    const trunkFlag     = p.showTrunk   ? 'Y' : 'N';

    const armsStr     = Math.round(p.armCount).toString();
    const minRectStr  = (Number.isFinite(p.minRectMm) ? p.minRectMm : 0).toFixed(1);
    const growFlag    = p.growSmallRects ? 'Y' : 'N';

    return `${angleStr}-${ratioStr}-${spacingStr}-${redStr}-${tipCode}-${runoffCode}-${tipScaleStr}-${tipOnlyFlag}-${tipCenterFlag}-${trunkFlag}-${armsStr}-${minRectStr}-${growFlag}`;
  }

function buildSingleTreeSegments(params) {
    const segments = [];

    const trunkLength = 50;
    const aspect = Math.max(0.02, params.rectAspectPercent / 100.0);
    const trunkWidth = trunkLength * aspect;

    const trunkAngle = Math.PI / 2;
    const spacing = params.spacingPercent;
    const angleOffset = params.branchAngleDeg * Math.PI / 180.0;
    const reduction = Math.max(0, Math.min(0.95, params.reductionPercent / 100.0));
    const tipMode = params.tipMode;
    const tipScale = Number.isFinite(params.tipScale) ? params.tipScale : 1;

    const runoffMode = params.runoff || 'Oo.';
    const shrink = 1 - reduction;

    // Lefutás: ugyanazt a logikát alkalmazzuk a törzs menti ágakra és az ágon belüli ágacskákra is.
    // idx: 1..count (belsőtől kifelé)
    function applyRunoff(baseLen, idx, count) {
      if (count <= 1) return baseLen; // oOo esetén is "ooo"
      if (runoffMode === 'ooo') return baseLen;
      if (runoffMode === '.oO') return baseLen * Math.pow(shrink, (count - idx));
      if (runoffMode === 'oOo') {
        const peak = Math.floor((count + 1) / 2); // párosnál az "belsőbb" középső
        const d = Math.abs(idx - peak);
        return baseLen * Math.pow(shrink, d);
      }
      // 'Oo.' (alapértelmezett)
      return baseLen * Math.pow(shrink, (idx - 1));
    }

    segments.push({
      bx: 0, by: 0,
      length: trunkLength,
      width: trunkWidth,
      angle: trunkAngle,
      tipMode,
      tipScale,
      isTrunk: true
    });

    const count = Math.floor(100 / spacing);
    const dTrunk = { x: Math.cos(trunkAngle), y: Math.sin(trunkAngle) };
    const signs = [+1, -1];

    for (let i = 1; i <= count; i++) {
      const t = i * spacing / 100.0;
      const posOnTrunk = trunkLength * t;

      const baseX = dTrunk.x * posOnTrunk;
      const baseY = dTrunk.y * posOnTrunk;

      // Törzs -> ág lefutás: az i=1 pozíció legyen a "bázis" méret (a korábbi viselkedéssel kompatibilis).
      const baseBranchLen = trunkLength * shrink; // korábbi i=1 méret
      const branchLength = applyRunoff(baseBranchLen, i, count);
      const branchWidth = branchLength * aspect;

      for (const sign of signs) {
        const branchAngle = trunkAngle + sign * angleOffset;
        segments.push({
          bx: baseX, by: baseY,
          length: branchLength,
          width: branchWidth,
          angle: branchAngle,
          tipMode,
          tipScale,
          isTrunk: false
        });

        const dBranch = { x: Math.cos(branchAngle), y: Math.sin(branchAngle) };

        for (let j = 1; j <= count; j++) {
          const t2 = j * spacing / 100.0;
          const posOnBranch = branchLength * t2;

          const twigBaseX = baseX + dBranch.x * posOnBranch;
          const twigBaseY = baseY + dBranch.y * posOnBranch;

          // Ág -> ágacska lefutás: bázis a j=1 méret.
          const baseTwigLen = branchLength * shrink; // korábbi j=1 méret
          const twigLength = applyRunoff(baseTwigLen, j, count);
          const twigWidth = twigLength * aspect;

          for (const sign2 of signs) {
            const twigAngle = branchAngle + sign2 * angleOffset;
            segments.push({
              bx: twigBaseX, by: twigBaseY,
              length: twigLength,
              width: twigWidth,
              angle: twigAngle,
              tipMode,
              tipScale,
              isTrunk: false
            });
          }
        }
      }
    }

    return segments;
  }

function buildSnowflakeSegments(params) {
    const baseSegs = buildSingleTreeSegments(params);
    const arms = Math.max(3, params.armCount);
    const all = [];
    const twoPi = 2 * Math.PI;

    for (let k = 0; k < arms; k++) {
      const phi = twoPi * k / arms;
      const cosP = Math.cos(phi);
      const sinP = Math.sin(phi);

      for (const s of baseSegs) {
        const x = s.bx;
        const y = s.by;
        const rx = x * cosP - y * sinP;
        const ry = x * sinP + y * cosP;

        all.push({
          bx: rx,
          by: ry,
          length: s.length,
          width: s.width,
          angle: s.angle + phi,
          tipMode: s.tipMode,
          tipScale: s.tipScale,
          isTrunk: s.isTrunk
        });
      }
    }
    return all;
  }

function makeRectFromBase(bx, by, length, width, angleRad) {
    const d = { x: Math.cos(angleRad), y: Math.sin(angleRad) };
    const n = { x: -Math.sin(angleRad), y: Math.cos(angleRad) };

    const halfL = length / 2;
    const halfW = width / 2;

    const cx = bx + d.x * halfL;
    const cy = by + d.y * halfL;

    const p1 = [ cx + n.x * halfW + d.x * halfL, cy + n.y * halfW + d.y * halfL ];
    const p2 = [ cx - n.x * halfW + d.x * halfL, cy - n.y * halfW + d.y * halfL ];
    const p3 = [ cx - n.x * halfW - d.x * halfL, cy - n.y * halfW - d.y * halfL ];
    const p4 = [ cx + n.x * halfW - d.x * halfL, cy + n.y * halfW - d.y * halfL ];

    return [p1, p2, p3, p4, p1.slice()];
  }

function buildTentHexFromEdge(p1, p2, dir, tipScale) {
    const dxB = p2[0] - p1[0];
    const dyB = p2[1] - p1[1];
    const b = Math.hypot(dxB, dyB);
    if (b <= 1e-9) return null;

    const baseDir = { x: dxB / b, y: dyB / b };
    const sqrt3 = Math.sqrt(3);
    const h = b / (2 * sqrt3);
    const midX = (p1[0] + p2[0]) * 0.5;
    const midY = (p1[1] + p2[1]) * 0.5;
    const apexX = midX + dir.x * h;
    const apexY = midY + dir.y * h;

    const A = p1;
    const B = p2;
    const C = [apexX, apexY];

    const v = { x: C[0] - A[0], y: C[1] - A[1] };
    const dot = v.x * baseDir.x + v.y * baseDir.y;
    const v_par = { x: baseDir.x * dot, y: baseDir.y * dot };
    const v_perp = { x: v.x - v_par.x, y: v.y - v_par.y };
    const C_ref = [ C[0] - 2 * v_perp.x, C[1] - 2 * v_perp.y ];

    const sLen = Math.hypot(C[0] - A[0], C[1] - A[1]);
    const t = { x: -dir.x * sLen, y: -dir.y * sLen };

    const A2 = [ A[0] + t.x, A[1] + t.y ];
    const B2 = [ B[0] + t.x, B[1] + t.y ];
    const C2 = [ C_ref[0] + t.x, C_ref[1] + t.y ];

    const pts = [A, B, C, A2, B2, C2].map(p => [p[0], p[1]]);

    let cx = 0, cy = 0;
    for (const [x, y] of pts) { cx += x; cy += y; }
    cx /= pts.length;
    cy /= pts.length;

    pts.sort((p, q) => {
      const angP = Math.atan2(p[1] - cy, p[0] - cx);
      const angQ = Math.atan2(q[1] - cy, q[0] - cx);
      return angP - angQ;
    });

    const hexPoly = pts.slice();
    hexPoly.push(hexPoly[0].slice());
    return scalePolygon(hexPoly, tipScale);
  }

function buildTrapHexFromEdge(p1, p2, dir, tipScale) {
    const dxB = p2[0] - p1[0];
    const dyB = p2[1] - p1[1];
    const b = Math.hypot(dxB, dyB);
    if (b <= 1e-9) return null;

    const wdir = { x: dxB / b, y: dyB / b };
    const midX = (p1[0] + p2[0]) * 0.5;
    const midY = (p1[1] + p2[1]) * 0.5;
    const sqrt3 = Math.sqrt(3);

    const h = (sqrt3 / 4) * b;
    const halfTop = b / 4;

    const local = [
      [ b/2,     0   ],
      [ halfTop, h   ],
      [-halfTop, h   ],
      [-b/2,     0   ],
      [-halfTop,-h   ],
      [ halfTop,-h   ]
    ];

    function toWorld(X, Y) {
      return [
        midX + X * wdir.x + Y * dir.x,
        midY + X * wdir.y + Y * dir.y
      ];
    }

    const hexTrapPoly = local.map(([X,Y]) => toWorld(X,Y));
    hexTrapPoly.push(hexTrapPoly[0].slice());
    return scalePolygon(hexTrapPoly, tipScale);
  }

function buildRegularHexFromEdge(p1, p2, dir, tipScale) {
    const dxB = p2[0] - p1[0];
    const dyB = p2[1] - p1[1];
    const b = Math.hypot(dxB, dyB);
    if (b <= 1e-9) return null;

    const wdir = { x: dxB / b, y: dyB / b };
    const midX = (p1[0] + p2[0]) * 0.5;
    const midY = (p1[1] + p2[1]) * 0.5;
    const sqrt3 = Math.sqrt(3);

    const local = [
      [-b/2, 0],
      [ b/2, 0],
      [ b,   (sqrt3/2)*b ],
      [ b/2,  sqrt3*b    ],
      [-b/2,  sqrt3*b    ],
      [-b,   (sqrt3/2)*b ]
    ];

    function toWorld(X, Y) {
      return [
        midX + X * wdir.x + Y * dir.x,
        midY + X * wdir.y + Y * dir.y
      ];
    }

    const hexPoly = local.map(([X,Y]) => toWorld(X,Y));
    hexPoly.push(hexPoly[0].slice());
    return scalePolygon(hexPoly, tipScale);
  }

function segmentToPolys(seg, params) {
    const polys = [];
    const mainRect = makeRectFromBase(seg.bx, seg.by, seg.length, seg.width, seg.angle);

    const tipMode     = seg.tipMode;
    const tipScale    = (typeof seg.tipScale === 'number' && isFinite(seg.tipScale)) ? seg.tipScale : 1;
    const onlyTips    = !!params.tipOnly;
    const addBaseTips = !!params.tipAtCenter && !!seg.isTrunk;
    const showTrunk   = !!params.showTrunk;

    if (seg.isTrunk) {
      if (showTrunk) polys.push(mainRect);
    } else {
      if (!onlyTips) polys.push(mainRect);
    }

    if (tipMode === 0) return polys;

    const d = { x: Math.cos(seg.angle), y: Math.sin(seg.angle) };

    if (tipMode === 2) {
      function addYAt(baseX, baseY, mainAngle) {
        const capLength = seg.length * 0.3 * tipScale;
        const capWidth  = seg.width;
        const deltas = [Math.PI / 3, -Math.PI / 3];
        for (const delta of deltas) {
          const tipAngle = mainAngle + delta;
          polys.push(makeRectFromBase(baseX, baseY, capLength, capWidth, tipAngle));
        }
      }
      const tipBaseX = seg.bx + d.x * seg.length;
      const tipBaseY = seg.by + d.y * seg.length;
      addYAt(tipBaseX, tipBaseY, seg.angle);
      if (addBaseTips) addYAt(seg.bx, seg.by, seg.angle + Math.PI);
      return polys;
    }

    const p1_far  = mainRect[0];
    const p2_far  = mainRect[1];
    const p1_near = mainRect[3];
    const p2_near = mainRect[2];

    const dTop  = d;
    const dBase = { x: -d.x, y: -d.y };

    if (tipMode === 1) {
      const hexTop = buildTentHexFromEdge(p1_far,  p2_far,  dTop,  tipScale);
      if (hexTop) polys.push(hexTop);
      if (addBaseTips) {
        const hexBase = buildTentHexFromEdge(p1_near, p2_near, dBase, tipScale);
        if (hexBase) polys.push(hexBase);
      }
    } else if (tipMode === 3) {
      const hexTop = buildRegularHexFromEdge(p1_far,  p2_far,  dTop,  tipScale);
      if (hexTop) polys.push(hexTop);
      if (addBaseTips) {
        const hexBase = buildRegularHexFromEdge(p1_near, p2_near, dBase, tipScale);
        if (hexBase) polys.push(hexBase);
      }
    } else if (tipMode === 4) {
      const hexTop = buildTrapHexFromEdge(p1_far,  p2_far,  dTop,  tipScale);
      if (hexTop) polys.push(hexTop);
      if (addBaseTips) {
        const hexBase = buildTrapHexFromEdge(p1_near, p2_near, dBase, tipScale);
        if (hexBase) polys.push(hexBase);
      }
    }

    return polys;
  }

function computePolysForParams(params) {
    const segments = buildSnowflakeSegments(params);
    if (!segments.length) return null;

    let minX0 = Infinity, maxX0 = -Infinity;
    let minY0 = Infinity, maxY0 = -Infinity;

    for (const seg of segments) {
      const polys = segmentToPolys(seg, params);
      for (const poly of polys) {
        for (const [x,y] of poly) {
          if (x < minX0) minX0 = x;
          if (x > maxX0) maxX0 = x;
          if (y < minY0) minY0 = y;
          if (y > maxY0) maxY0 = y;
        }
      }
    }

    const width0  = maxX0 - minX0 || 1;
    const height0 = maxY0 - minY0 || 1;
    const size0   = Math.max(width0, height0) || 1;

    const scaleModelToMm = DXF_TARGET_SIZE / size0;
    const minRectMm  = Math.max(0, params.minRectMm || 0);
    const growSmall  = params.growSmallRects;
    const minWidthModel = minRectMm > 0 ? (minRectMm / scaleModelToMm) : 0;

    const adjustedSegments = [];
    for (const seg of segments) {
      if (minWidthModel <= 0) {
        adjustedSegments.push(seg);
      } else if (seg.width >= minWidthModel) {
        adjustedSegments.push(seg);
      } else if (growSmall) {
        adjustedSegments.push({ ...seg, width: minWidthModel });
      }
    }
    if (!adjustedSegments.length) return null;

    const rects = [];
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const seg of adjustedSegments) {
      const polys = segmentToPolys(seg, params);
      for (const poly of polys) {
        rects.push(poly);
        for (const [x,y] of poly) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const width  = maxX - minX || 1;
    const height = maxY - minY || 1;
    const size   = Math.max(width, height) || 1;
    const scale  = DXF_TARGET_SIZE / size;

    const scaledPolys = rects.map(poly =>
      poly.map(([x,y]) => [ (x - minX) * scale, (y - minY) * scale ])
    );

    return {
      polys: scaledPolys,
      minX: 0,
      maxX: width * scale,
      minY: 0,
      maxY: height * scale
    };
  }

function computePolysForCode(codeString) {
    const params = paramsFromCode(codeString);
    return computePolysForParams(params);
  }

function buildLaserContoursExact(scaledPolys) {
    if (!scaledPolys || !scaledPolys.length) return [];

    const EPS = 1e-9;

    const polyInfos = scaledPolys.map(poly => {
      const unique = poly.slice(0, poly.length - 1);
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;
      for (const [x,y] of unique) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      return { poly, unique, minX, maxX, minY, maxY };
    });

    function pointInAnyPoly(x, y) {
      for (const info of polyInfos) {
        if (x < info.minX - 1e-6 || x > info.maxX + 1e-6 ||
            y < info.minY - 1e-6 || y > info.maxY + 1e-6) continue;
        if (pointInPolygon(x, y, info.poly)) return true;
      }
      return false;
    }

    const edges = [];
    for (let pi = 0; pi < scaledPolys.length; pi++) {
      const poly = scaledPolys[pi];
      const unique = poly.slice(0, poly.length - 1);
      const n = unique.length;
      if (n < 2) continue;
      for (let i = 0; i < n; i++) {
        const a = unique[i];
        const b = unique[(i + 1) % n];
        edges.push({
          ax: a[0], ay: a[1],
          bx: b[0], by: b[1],
          polyIndex: pi,
          splitTs: [0, 1]
        });
      }
    }

    function addParam(arr, t) {
      if (t < -EPS || t > 1 + EPS) return;
      t = Math.max(0, Math.min(1, t));
      for (let i = 0; i < arr.length; i++) {
        if (Math.abs(arr[i] - t) < 1e-6) return;
      }
      arr.push(t);
    }

    function intersectEdges(e1, e2) {
      const p = { x: e1.ax, y: e1.ay };
      const r = { x: e1.bx - e1.ax, y: e1.by - e1.ay };
      const q = { x: e2.ax, y: e2.ay };
      const s = { x: e2.bx - e2.ax, y: e2.by - e2.ay };

      const rxs = r.x * s.y - r.y * s.x;
      const qmp = { x: q.x - p.x, y: q.y - p.y };
      const qpxr = qmp.x * r.y - qmp.y * r.x;
      const rr = r.x * r.x + r.y * r.y;
      const ss = s.x * s.x + s.y * s.y;

      if (Math.abs(rxs) < 1e-9) {
        if (Math.abs(qpxr) > 1e-9) return;

        // Collinear overlap: split both segments at overlap endpoints
        if (rr < 1e-12 || ss < 1e-12) return;

        const t0 = ( (q.x - p.x) * r.x + (q.y - p.y) * r.y ) / rr;
        const t1 = ( (q.x + s.x - p.x) * r.x + (q.y + s.y - p.y) * r.y ) / rr;

        const tmin = Math.max(0, Math.min(t0, t1));
        const tmax = Math.min(1, Math.max(t0, t1));
        if (tmax < -1e-9 || tmin > 1 + 1e-9 || tmax - tmin < 1e-9) return;

        addParam(e1.splitTs, tmin);
        addParam(e1.splitTs, tmax);

        const u0 = ( (p.x - q.x) * s.x + (p.y - q.y) * s.y ) / ss;
        const u1 = ( (p.x + r.x - q.x) * s.x + (p.y + r.y - q.y) * s.y ) / ss;

        const umin = Math.max(0, Math.min(u0, u1));
        const umax = Math.min(1, Math.max(u0, u1));
        if (umax < -1e-9 || umin > 1 + 1e-9 || umax - umin < 1e-9) return;

        addParam(e2.splitTs, umin);
        addParam(e2.splitTs, umax);
      } else {
        const t = (qmp.x * s.y - qmp.y * s.x) / rxs;
        const u = (qmp.x * r.y - qmp.y * r.x) / rxs;
        if (t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
          addParam(e1.splitTs, t);
          addParam(e2.splitTs, u);
        }
      }
    }

    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        intersectEdges(edges[i], edges[j]);
      }
    }

    const rawSegments = [];
    for (const e of edges) {
      const { ax, ay, bx, by, splitTs } = e;
      splitTs.sort((a, b) => a - b);
      for (let k = 0; k < splitTs.length - 1; k++) {
        const t0 = splitTs[k];
        const t1 = splitTs[k + 1];
        if (t1 - t0 < 1e-5) continue;
        const x0 = ax + (bx - ax) * t0;
        const y0 = ay + (by - ay) * t0;
        const x1 = ax + (bx - ax) * t1;
        const y1 = ay + (by - ay) * t1;
        rawSegments.push({ x0, y0, x1, y1 });
      }
    }

      const orientedSegments = [];
  for (const seg of rawSegments) {
    const dx = seg.x1 - seg.x0;
    const dy = seg.y1 - seg.y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;

    const mx = 0.5 * (seg.x0 + seg.x1);
    const my = 0.5 * (seg.y0 + seg.y1);

    // A (x0,y0)->(x1,y1) irány bal oldali normálja
    const nx = -dy / len;
    const ny =  dx / len;
    const off = 1e-3;

    const pxL = mx + nx * off;
    const pyL = my + ny * off;
    const pxR = mx - nx * off;
    const pyR = my - ny * off;

    const insideL = pointInAnyPoly(pxL, pyL);
    const insideR = pointInAnyPoly(pxR, pyR);

    if (insideL === insideR) continue; // nem határszegmens

    // Irányítsuk úgy a szegmenst, hogy a "szilárd" rész bal oldalon legyen.
    if (insideL) {
      orientedSegments.push(seg);
    } else {
      orientedSegments.push({ x0: seg.x1, y0: seg.y1, x1: seg.x0, y1: seg.y0 });
    }
  }

  // --- Build closed contours from oriented boundary segments (single-use edges; no duplicates) ---
  const KEY_SCALE = 1e4; // 0.0001 unit quantization for stable vertex matching
  const vKey = (x, y) => Math.round(x * KEY_SCALE) + ',' + Math.round(y * KEY_SCALE);

  // Deduplicate undirected segments (numeric noise / overlap can create duplicates)
  const seenUnd = new Set();

  const verts = new Map(); // key -> { x, y, outs: [] }
  const allEdges = [];     // directed edges (each boundary segment appears once)

  function getVert(k, x, y) {
    let v = verts.get(k);
    if (!v) {
      v = { x, y, outs: [] };
      verts.set(k, v);
    }
    return v;
  }

  function addEdge(k0, x0, y0, k1, x1, y1) {
    const from = getVert(k0, x0, y0);
    const to   = getVert(k1, x1, y1);
    const ang  = Math.atan2(to.y - from.y, to.x - from.x);
    const e = {
      fromK: k0, toK: k1,
      fromPt: [from.x, from.y],
      toPt: [to.x, to.y],
      ang,
      visited: false
    };
    from.outs.push(e);
    allEdges.push(e);
  }

  for (const seg of orientedSegments) {
    const k0 = vKey(seg.x0, seg.y0);
    const k1 = vKey(seg.x1, seg.y1);

    // undirected key
    const und = (k0 < k1) ? (k0 + '|' + k1) : (k1 + '|' + k0);
    if (seenUnd.has(und)) continue;
    seenUnd.add(und);

    addEdge(k0, seg.x0, seg.y0, k1, seg.x1, seg.y1);
  }

  // Sort outgoing edges around each vertex by angle
  for (const v of verts.values()) {
    v.outs.sort((a, b) => a.ang - b.ang);
  }

  function normAngle(a) {
    while (a <= -Math.PI) a += 2 * Math.PI;
    while (a >  Math.PI) a -= 2 * Math.PI;
    return a;
  }

  function angleDiffCCW(fromAng, toAng) {
    // minimal positive CCW turn from fromAng to toAng, in (0, 2π]
    let d = normAngle(toAng - fromAng);
    if (d <= 0) d += 2 * Math.PI;
    return d;
  }

  function pickNextEdge(prevEdge) {
    const v = verts.get(prevEdge.toK);
    if (!v || !v.outs.length) return null;

    // Incoming direction at the vertex: from current vertex back to previous vertex
    const inAng = Math.atan2(
      prevEdge.fromPt[1] - prevEdge.toPt[1],
      prevEdge.fromPt[0] - prevEdge.toPt[0]
    );

    let best = null;
    let bestTurn = Infinity;

    for (const e of v.outs) {
      if (e.visited) continue;
      const turn = angleDiffCCW(inAng, e.ang);
      if (turn < bestTurn) {
        bestTurn = turn;
        best = e;
      }
    }
    return best;
  }

  const contours = [];
  const MAX_STEPS = allEdges.length + 10;

  for (const startEdge of allEdges) {
    if (startEdge.visited) continue;

    const startK = startEdge.fromK;
    const contour = [startEdge.fromPt.slice()];
    let e = startEdge;
    let steps = 0;

    while (e && !e.visited && steps < MAX_STEPS) {
      e.visited = true;
      contour.push(e.toPt.slice());

      // Closed when we return to the starting vertex
      if (e.toK === startK) break;

      e = pickNextEdge(e);
      steps++;
    }

    // Accept only properly closed loops
    if (contour.length >= 4) {
      const first = contour[0];
      const last  = contour[contour.length - 1];
      const d = Math.hypot(first[0] - last[0], first[1] - last[1]);
      if (d > 1e-3) continue;

      // Remove tiny consecutive duplicates
      const cleaned = [contour[0]];
      for (let i = 1; i < contour.length; i++) {
        const p = contour[i];
        const q = cleaned[cleaned.length - 1];
        if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) cleaned.push(p);
      }

      if (cleaned.length >= 4) contours.push(cleaned);
    }
  }

  return contours;
}

function addJpegCommentToArrayBuffer(arrayBuffer, comment) {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
      return new Blob([bytes], { type: 'image/jpeg' });
    }
    const encoder = new TextEncoder();
    const commentBytes = encoder.encode(comment);
    const len = commentBytes.length + 2;

    const newBytes = new Uint8Array(bytes.length + commentBytes.length + 4);
    let offset = 0;

    newBytes[offset++] = 0xFF;
    newBytes[offset++] = 0xD8;

    newBytes[offset++] = 0xFF;
    newBytes[offset++] = 0xFE;
    newBytes[offset++] = (len >> 8) & 0xFF;
    newBytes[offset++] = len & 0xFF;

    newBytes.set(commentBytes, offset);
    offset += commentBytes.length;

    newBytes.set(bytes.subarray(2), offset);

    return new Blob([newBytes], { type: 'image/jpeg' });
  }


  // Blob -> ArrayBuffer (a JPG komment beágyazáshoz).
  // Korábbi verziókban ez a helper még a HTML-ben volt; a core-ba is kell.
  async function blobToArrayBuffer(blob) {
    if (!blob) throw new Error('blobToArrayBuffer: blob null');
    if (typeof blob.arrayBuffer === 'function') return await blob.arrayBuffer();
    // Fallback régebbi böngészőkre
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('FileReader error'));
      reader.readAsArrayBuffer(blob);
    });
  }

function createJpegBlobForCode(code, paramsOrTheme = null) {
    /**
     * JPEG előnézetet készít egy PEHELY kódhoz.
     *
     * 2. paraméter (paramsOrTheme) jelentése:
     *  - string: téma / színvilág: 'blue' (alapértelmezett) vagy 'bordo'
     *  - object: paraméter-felülbírálás (Generator exportnál használjuk)
     *  - object { params: {...}, theme: 'bordo' }: opcionális, későbbi bővíthetőség
     *
     * Fontos: a HAVAZO a "csak kártyán szereplő" (nincs JPG) előnézetekhez
     * 'bordo' témát kér; a meglévő (betöltött/mentett) JPG-k a 'blue' témát használják.
     */
    let theme = 'blue';
    let paramsOverride = null;

    if (typeof paramsOrTheme === 'string') {
      theme = paramsOrTheme;
    } else if (paramsOrTheme && typeof paramsOrTheme === 'object') {
      if (paramsOrTheme.params && typeof paramsOrTheme.params === 'object') {
        paramsOverride = paramsOrTheme.params;
        if (typeof paramsOrTheme.theme === 'string') theme = paramsOrTheme.theme;
      } else {
        // közvetlen paraméter-objektum
        paramsOverride = paramsOrTheme;
      }
    }

    const params = paramsOverride || paramsFromCode(code);
    const polyData = computePolysForParams(params);
    if (!polyData) return Promise.resolve(null);
    const { polys, minX, maxX, minY, maxY } = polyData;

    // Színpaletta – a felhasználói minták alapján
    const palette = (theme === 'bordo')
      ? { bg: '#5e0700', fg: '#fbeed2', text: '#fbeed2' }
      : { bg: '#001633', fg: '#bfe9ff', text: '#ffffff' };

    const canvas = document.createElement('canvas');
    canvas.width  = 600;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');

    // háttér
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const width  = maxX - minX || 1;
    const height = maxY - minY || 1;

    const marginX   = 40;
    const topMargin = 40;
    const textSpace = 70;
    const drawWidth  = canvas.width - 2 * marginX;
    const drawHeight = canvas.height - topMargin - textSpace;

    const scale  = 0.95 * Math.min(drawWidth / width, drawHeight / height);
    const cx     = (minX + maxX) / 2;
    const cy     = (minY + maxY) / 2;
    const originX = canvas.width / 2;
    const originY = topMargin + drawHeight / 2;

    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.lineWidth   = 1.2;
    ctx.fillStyle   = palette.fg;
    ctx.strokeStyle = palette.fg;

    for (const poly of polys) {
      if (!poly || poly.length < 2) continue;
      ctx.beginPath();
      for (let i = 0; i < poly.length; i++) {
        const x = poly[i][0];
        const y = poly[i][1];
        const sx = originX + (x - cx) * scale;
        const sy = originY - (y - cy) * scale;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // kód felirat alul
    ctx.fillStyle = palette.text;
    ctx.font = '16px system-ui, -apple-system, BlinkMacSystemFont,"Segoe UI",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(code, canvas.width / 2, canvas.height - textSpace / 2);

    return new Promise((resolve) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          resolve(null);
          return;
        }
        try {
          const arr = await blobToArrayBuffer(blob);
          const commentedBlob = addJpegCommentToArrayBuffer(arr, 'PEHELY-' + code);
          resolve(commentedBlob);
        } catch (e) {
          console.error('JPG komment beágyazási hiba:', e);
          resolve(blob);
        }
      }, 'image/jpeg', 0.92);
    });
  }

function parseCodeFromJpegArrayBuffer(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return null;

    let i = 2;
    while (i + 4 <= bytes.length) {
      if (bytes[i] !== 0xFF) { i++; continue; }
      const marker = bytes[i + 1];
      if (marker === 0xD9 || marker === 0xDA) break;
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2 || i + 2 + len > bytes.length) break;

      if (marker === 0xFE) {
        const start = i + 4;
        const end   = i + 2 + len;
        const comBytes = bytes.subarray(start, end);
        const decoder  = new TextDecoder('utf-8');
        const text     = decoder.decode(comBytes);
        const idx      = text.indexOf('PEHELY-');
        if (idx !== -1) {
          const code = text.substring(idx + 7).trim();
          if (code) return code;
        }
      }
      i += 2 + len;
    }
    return null;
  }


/**
 * Kontúrok számítása (külső/belső) paraméterekből.
 * DOM-mentes: csak geometriát ad vissza.
 *
 * Visszatérés:
 *   { contoursWithFlags: [{points:[[x,y],...], isOuter:boolean}, ...] }
 * A pontlista zárt (utolsó pont = első), ahogy a buildLaserContoursExact adja.
 */
function computeContoursForParams(params) {
  const polyRes = computePolysForParams(params);
  if (!polyRes || !polyRes.polys || !polyRes.polys.length) return null;

  const contours = buildLaserContoursExact(polyRes.polys);
  if (!contours || !contours.length) return null;

  // Külső kontúr: legnagyobb abszolút területű hurok.
  let outerIndex = 0;
  let maxAbsArea = -Infinity;

  for (let i = 0; i < contours.length; i++) {
    const contour = contours[i];
    if (!contour || contour.length < 4) continue; // zárt poligon: min 3 + záró pont

    // A buildLaserContoursExact záró pontot ad: hagyjuk ki az utolsót területhez.
    const unique = contour.slice(0, contour.length - 1);
    if (unique.length < 3) continue;

    let area = 0;
    for (let j = 0, k = unique.length - 1; j < unique.length; k = j++) {
      const xi = unique[j][0], yi = unique[j][1];
      const xj = unique[k][0], yj = unique[k][1];
      area += (xj * yi - xi * yj);
    }
    area *= 0.5;

    const absArea = Math.abs(area);
    if (absArea > maxAbsArea) {
      maxAbsArea = absArea;
      outerIndex = i;
    }
  }

  const contoursWithFlags = contours.map((c, idx) => ({
    points: c,
    isOuter: idx === outerIndex
  }));

  return { contoursWithFlags };
}

/**
 * Kontúrok számítása PEHELY-kódból.
 * Régi (lefutás nélküli) kódoknál automatikusan Oo. lesz a lefutás.
 */
function computeContoursForCode(codeString) {
  const params = paramsFromCode(codeString);
  return computeContoursForParams(params);
}


  // Exports
  PehelyCore.pointInPolygon = pointInPolygon;
  PehelyCore.scalePolygon = scalePolygon;
  PehelyCore.paramsFromCode = paramsFromCode;
  PehelyCore.buildCodeFromParams = buildCodeFromParams;
  PehelyCore.buildSingleTreeSegments = buildSingleTreeSegments;
  PehelyCore.buildSnowflakeSegments = buildSnowflakeSegments;
  PehelyCore.makeRectFromBase = makeRectFromBase;
  PehelyCore.buildTentHexFromEdge = buildTentHexFromEdge;
  PehelyCore.buildTrapHexFromEdge = buildTrapHexFromEdge;
  PehelyCore.buildRegularHexFromEdge = buildRegularHexFromEdge;
  PehelyCore.segmentToPolys = segmentToPolys;
  PehelyCore.computePolysForParams = computePolysForParams;
  PehelyCore.computePolysForCode = computePolysForCode;
  PehelyCore.buildLaserContoursExact = buildLaserContoursExact;
  PehelyCore.computeContoursForParams = computeContoursForParams;
  PehelyCore.computeContoursForCode = computeContoursForCode;
  PehelyCore.addJpegCommentToArrayBuffer = addJpegCommentToArrayBuffer;
  PehelyCore.blobToArrayBuffer = blobToArrayBuffer;
  PehelyCore.createJpegBlobForCode = createJpegBlobForCode;
  PehelyCore.parseCodeFromJpegArrayBuffer = parseCodeFromJpegArrayBuffer;

  global.PehelyCore = PehelyCore;
})(typeof window !== 'undefined' ? window : globalThis);
