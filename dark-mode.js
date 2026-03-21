/* ═══════════════════════════════════════════════════════════════
   FLUID DARK MODE — JS Engine
   Faithful port of volodymyr-sch/FluidDarkMode AGSL shader

   Web implementation:
   - View Transition API captures old/new snapshots
   - Web Animations API animates ::view-transition-new(root) with
     pre-computed noise-warped polygon clip-paths (not a smooth circle)
   - Canvas overlay renders glow wave front + concentric ripple rings
     with the same fbm noise warp
   - Fallback for browsers without View Transition API
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ── Configuration (matching AGSL shader values) ── */
  const DURATION        = 1800;  // ms — transition duration
  const WARP_MARGIN     = 160;   // px — max noise displacement range
  const BASE_WIDTH      = 120;   // px — wave front band width
  const GLOW_BRIGHTNESS = 0.65;  // 0–1 glow intensity
  const POLY_POINTS     = 120;   // vertices per polygon frame
  const KEYFRAME_COUNT  = 72;    // pre-computed frames for polygon

  /* cubic-bezier(0.4, 0, 0.2, 1) — FastOutSlowInEasing */
  function ease(t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    if (t < 0.5) return 4 * t * t * t;
    return 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /* ─────────────────────────────────────────────────
     NOISE — ported 1:1 from AGSL shader
     hash → noise → fbmNormalized
     ───────────────────────────────────────────────── */
  function fract(x) { return x - Math.floor(x); }

  function hash(x, y) {
    return fract(Math.sin(x * 127.5 + y * 315.10) * 45148.43);
  }

  function noise(ux, uy) {
    const cx = Math.floor(ux), cy = Math.floor(uy);
    const fx = ux - cx, fy = uy - cy;
    const bl = hash(cx,     cy);
    const br = hash(cx + 1, cy);
    const tl = hash(cx,     cy + 1);
    const tr = hash(cx + 1, cy + 1);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    return (bl + (br - bl) * sx) * (1 - sy) + (tl + (tr - tl) * sx) * sy;
  }

  function fbm(ux, uy) {
    let t = 0, a = 0.5, w = 0;
    t += noise(ux, uy) * a;                       w += a; a *= 0.5;
    t += noise(ux*2+17, uy*2+9) * a;              w += a; a *= 0.5;
    t += noise(ux*4+31, uy*4+15) * a;             w += a; a *= 0.5;
    t += noise(ux*8+47, uy*8+23) * a;             w += a;
    return t / w;
  }

  function smoothstep(e0, e1, x) {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  }

  /* ─────────────────────────────────────────────────
     Compute the noise-warped boundary radius at a
     given angle — the core of the AGSL shader ported
     to produce polygon vertices.
     ───────────────────────────────────────────────── */
  function boundaryRadius(angle, radius, maxR, time) {
    const progress = radius / Math.max(maxR, 1);
    const remapped = progress * WARP_MARGIN;
    const warpGate = smoothstep(0.85, 1.0, progress);
    const extraMargin = WARP_MARGIN * warpGate;

    const c = Math.cos(angle), s = Math.sin(angle);

    /* Noise layer 1: angular — direction-based */
    const n1 = fbm(c * 20 + time * 0.15, s * 20);
    /* Noise layer 2: spatial — position-based */
    const n2 = fbm(c * radius * 0.03 + time * 0.35,
                    s * radius * 0.03 - time * 0.2);

    const warp = ((n1 - 0.5) * 0.65 + (n2 - 0.5) * 0.35) * 2 * remapped;

    /* boundary where SDF == 0: len = radius + extraMargin - warp */
    return Math.max(radius + extraMargin - warp, 0);
  }

  /* ─────────────────────────────────────────────────
     Pre-compute all polygon keyframes for the reveal
     ───────────────────────────────────────────────── */
  function buildKeyframes(cx, cy, maxR) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const frames = [];

    for (let f = 0; f <= KEYFRAME_COUNT; f++) {
      const t = f / KEYFRAME_COUNT;
      const eased = ease(t);
      const r = eased * maxR;
      const time = t * 3.6;          // match shader's 3600ms feel

      const pts = [];
      for (let i = 0; i < POLY_POINTS; i++) {
        const angle = (i / POLY_POINTS) * Math.PI * 2;
        const br = boundaryRadius(angle, r, maxR, time);
        const px = ((cx + Math.cos(angle) * br) / vw * 100).toFixed(2);
        const py = ((cy + Math.sin(angle) * br) / vh * 100).toFixed(2);
        pts.push(px + '% ' + py + '%');
      }

      frames.push({ clipPath: 'polygon(' + pts.join(',') + ')' });
    }

    /* Last frame: full viewport rect (clean finish) */
    frames[frames.length - 1] = {
      clipPath: 'polygon(-5% -5%, 105% -5%, 105% 105%, -5% 105%)'
    };

    return frames;
  }

  /* ─────────────────────────────────────────────────
     CANVAS — glow ring + noise ripple rings
     ───────────────────────────────────────────────── */
  let canvasEl = null;

  function ensureCanvas() {
    if (!canvasEl) {
      canvasEl = document.createElement('canvas');
      canvasEl.id = 'fluid-dark-mode-canvas';
      document.body.appendChild(canvasEl);
    }
    const dpr = devicePixelRatio || 1;
    canvasEl.width  = innerWidth * dpr;
    canvasEl.height = innerHeight * dpr;
    canvasEl.style.cssText =
      'position:fixed;top:0;left:0;width:100vw;height:100vh;' +
      'z-index:2147483646;pointer-events:none;display:block;';
    return canvasEl;
  }

  function hideCanvas() {
    if (canvasEl) canvasEl.style.display = 'none';
  }

  function animateCanvas(cx, cy, maxR, duration, isDarkening) {
    const canvas = ensureCanvas();
    const ctx = canvas.getContext('2d');
    const dpr = devicePixelRatio || 1;
    const w = canvas.width, h = canvas.height;
    const CX = cx * dpr, CY = cy * dpr, MR = maxR * dpr;
    const start = performance.now();
    const RIPPLE_COUNT  = 5;
    const RIPPLE_SPACE  = 35 * dpr;
    const RING_POINTS   = 90;

    function frame(now) {
      const elapsed = now - start;
      const raw = Math.min(elapsed / duration, 1);
      const t = ease(raw);
      const r = t * MR;
      const time = elapsed / 1000;

      ctx.clearRect(0, 0, w, h);
      if (raw >= 1) { hideCanvas(); return; }

      const progress = r / Math.max(MR, 1);
      const glowGate = smoothstep(0.05, 0.2, progress);
      const fadeOut   = 1 - smoothstep(0.65, 1.0, raw);

      /* ── 1. Radial glow band at the wave front ── */
      const bw = BASE_WIDTH * dpr;
      const glowA = GLOW_BRIGHTNESS * glowGate * fadeOut;
      if (glowA > 0.01) {
        const iR = Math.max(r - bw * 2, 0);
        const oR = r + bw * 2;
        const g = ctx.createRadialGradient(CX, CY, iR, CX, CY, oR);
        if (isDarkening) {
          g.addColorStop(0,   'rgba(80,40,160,0)');
          g.addColorStop(0.35, `rgba(130,70,210,${(glowA*0.2).toFixed(3)})`);
          g.addColorStop(0.50, `rgba(168,85,247,${(glowA*0.45).toFixed(3)})`);
          g.addColorStop(0.65, `rgba(130,70,210,${(glowA*0.2).toFixed(3)})`);
          g.addColorStop(1,   'rgba(80,40,160,0)');
        } else {
          g.addColorStop(0,   'rgba(200,170,255,0)');
          g.addColorStop(0.35, `rgba(220,200,255,${(glowA*0.25).toFixed(3)})`);
          g.addColorStop(0.50, `rgba(255,255,255,${(glowA*0.55).toFixed(3)})`);
          g.addColorStop(0.65, `rgba(220,200,255,${(glowA*0.25).toFixed(3)})`);
          g.addColorStop(1,   'rgba(200,170,255,0)');
        }
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }

      /* ── 2. Noise-warped main edge glow path ── */
      if (glowA > 0.02 && r > 5) {
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= RING_POINTS; i++) {
          const a = (i / RING_POINTS) * Math.PI * 2;
          const c = Math.cos(a), s = Math.sin(a);
          const n1 = fbm(c * 20 + time * 0.15, s * 20);
          const n2 = fbm(c * r * 0.003 + time * 0.35,
                         s * r * 0.003 - time * 0.2);
          const warp = ((n1-0.5)*0.65 + (n2-0.5)*0.35) * 2 *
                       (progress * WARP_MARGIN * dpr);
          const warpGate = smoothstep(0.85, 1.0, progress);
          const er = r + warp * (1 - warpGate);
          const px = CX + c * er, py = CY + s * er;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = isDarkening
          ? `rgba(168,85,247,${(glowA*0.7).toFixed(3)})`
          : `rgba(255,255,255,${(glowA*0.8).toFixed(3)})`;
        ctx.lineWidth = 3 * dpr;
        ctx.shadowColor = isDarkening ? 'rgba(168,85,247,0.6)' : 'rgba(255,255,255,0.6)';
        ctx.shadowBlur = 18 * dpr;
        ctx.stroke();
        ctx.restore();
      }

      /* ── 3. Concentric ripple rings trailing behind the wave ── */
      for (let ri = 1; ri <= RIPPLE_COUNT; ri++) {
        const ripR = r - ri * RIPPLE_SPACE;
        if (ripR <= 0) continue;
        const ripAlpha = (1 - ri / (RIPPLE_COUNT + 1)) * 0.35 * glowGate * fadeOut;
        if (ripAlpha < 0.005) continue;

        ctx.save();
        ctx.beginPath();
        for (let i = 0; i <= RING_POINTS; i++) {
          const a = (i / RING_POINTS) * Math.PI * 2;
          const c = Math.cos(a), s = Math.sin(a);
          const n = fbm(c * 15 + time * 0.12 + ri * 3.7, s * 15 + ri * 5.3);
          const nOff = (n - 0.5) * 25 * dpr * (1 - ri / (RIPPLE_COUNT + 1));
          const px = CX + c * (ripR + nOff);
          const py = CY + s * (ripR + nOff);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = isDarkening
          ? `rgba(130,70,210,${ripAlpha.toFixed(3)})`
          : `rgba(210,190,255,${ripAlpha.toFixed(3)})`;
        ctx.lineWidth = Math.max((2.5 - ri * 0.35) * dpr, 0.5 * dpr);
        ctx.stroke();
        ctx.restore();
      }

      /* ── 4. Bright particles scattered along the noisy edge ── */
      if (glowA > 0.03 && r > 10) {
        const particleCount = 60;
        for (let i = 0; i < particleCount; i++) {
          const a = (i / particleCount) * Math.PI * 2;
          const c = Math.cos(a), s = Math.sin(a);
          const n1 = fbm(c * 20 + time * 0.15, s * 20);
          const n2 = fbm(c * r * 0.003 + time * 0.35,
                         s * r * 0.003 - time * 0.2);
          const warp = ((n1-0.5)*0.65 + (n2-0.5)*0.35) * 2 *
                       (progress * WARP_MARGIN * dpr);
          const warpGate = smoothstep(0.85, 1.0, progress);
          const er = r + warp * (1 - warpGate);

          /* scatter particle slightly around the edge */
          const scatter = (fbm(i * 7.3 + time * 2.0, a * 5) - 0.5) * bw * 0.6;
          const pr = er + scatter;
          const px = CX + c * pr, py = CY + s * pr;

          const intensity = Math.abs(scatter) < bw * 0.2 ? 1.0 : 0.4;
          const pAlpha = glowA * intensity * 0.6;
          const pSize = (2 + fbm(i * 3.1, time * 1.5) * 4) * dpr;

          ctx.beginPath();
          ctx.arc(px, py, pSize, 0, Math.PI * 2);
          ctx.fillStyle = isDarkening
            ? `rgba(200,160,255,${pAlpha.toFixed(3)})`
            : `rgba(255,255,255,${pAlpha.toFixed(3)})`;
          ctx.fill();
        }
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ─────────────────────────────────────────────────
     STATE + THEME
     ───────────────────────────────────────────────── */
  let isTransitionRunning = false;

  function getStoredTheme() {
    try { return localStorage.getItem('elevated-theme') || 'dark'; }
    catch(e) { return 'dark'; }
  }
  function setStoredTheme(v) {
    try { localStorage.setItem('elevated-theme', v); } catch(e) {}
  }
  function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  }
  function switchTheme() {
    const next = getCurrentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    setStoredTheme(next);
  }

  /* ─────────────────────────────────────────────────
     TOGGLE HANDLER
     ───────────────────────────────────────────────── */
  function handleToggle(event) {
    if (isTransitionRunning) return;
    isTransitionRunning = true;

    const btn = event.currentTarget || event.target;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = Math.hypot(
      Math.max(cx, innerWidth - cx),
      Math.max(cy, innerHeight - cy)
    ) * 1.05; // slight overshoot to ensure full coverage

    const isDarkening = getCurrentTheme() === 'light';

    if (document.startViewTransition) {
      /* ── Build polygon keyframes BEFORE the transition
            (heavy compute — ~6ms on modern hardware) ── */
      const keyframes = buildKeyframes(cx, cy, maxR);

      const transition = document.startViewTransition(() => switchTheme());

      transition.ready.then(() => {
        /* Drive the reveal with noise-warped polygon clip-path */
        document.documentElement.animate(keyframes, {
          duration: DURATION,
          easing: 'linear',   /* easing already baked into keyframes */
          pseudoElement: '::view-transition-new(root)',
          fill: 'forwards',
        });

        /* Canvas glow + ripple overlay in parallel */
        animateCanvas(cx, cy, maxR, DURATION, isDarkening);
      }).catch(() => {
        hideCanvas();
        isTransitionRunning = false;
      });

      transition.finished.then(() => {
        isTransitionRunning = false;
      }).catch(() => {
        isTransitionRunning = false;
      });

    } else {
      /* Fallback — simple theme switch + canvas only */
      switchTheme();
      animateCanvas(cx, cy, maxR, DURATION, isDarkening);
      setTimeout(() => { isTransitionRunning = false; }, DURATION);
    }
  }

  /* ─────────────────────────────────────────────────
     INIT + BINDING
     ───────────────────────────────────────────────── */
  function init() {
    document.documentElement.setAttribute('data-theme', getStoredTheme());

    function onReady() {
      bindToggle();
      const nav = document.getElementById('navbar-container');
      if (nav && !document.getElementById('fluid-dark-toggle')) {
        const obs = new MutationObserver(() => {
          if (document.getElementById('fluid-dark-toggle')) {
            bindToggle();
            obs.disconnect();
          }
        });
        obs.observe(nav, { childList: true, subtree: true });
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady);
    } else {
      onReady();
    }
  }

  function bindToggle() {
    const btn = document.getElementById('fluid-dark-toggle');
    if (btn && !btn.hasAttribute('data-fluid-init')) {
      btn.setAttribute('data-fluid-init', 'true');
      btn.addEventListener('click', handleToggle);
    }
  }

  init();
})();
