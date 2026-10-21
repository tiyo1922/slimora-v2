import React, { useRef, useEffect } from 'react';

/**
 * StripeProgress - Canvas-based pill progress bar with animated diagonal stripes,
 * moving light gleam, pulsing head dot, and gradient fill (Teal to Purple).
 * Compact height (24px) for sleek and proportional UI display.
 */
export default function StripeProgress({ progress = 0, height = 24 }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    target: progress / 100,
    shown: progress / 100,
    t: 0,
    last: performance.now(),
  });

  // Keep target updated with incoming progress prop
  useEffect(() => {
    const val = Math.max(0, Math.min(1, progress / 100));
    stateRef.current.target = val;
    if (val === 0) {
      stateRef.current.shown = 0;
    }
  }, [progress]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    let animId;
    const cA = [0, 214, 180]; // Teal
    const cB = [132, 92, 255]; // Purple
    const H = height;

    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function frame(now) {
      const state = stateRef.current;
      const dt = Math.min((now - state.last) / 1000, 0.1);
      state.last = now;
      state.t += dt;

      // Responsive smooth easing towards target (fast response to real-time events)
      const diff = state.target - state.shown;
      if (Math.abs(diff) < 0.003) {
        state.shown = state.target;
      } else {
        state.shown += diff * (1 - Math.exp(-dt * 18));
      }

      const parent = cv.parentElement;
      const W = Math.max(20, parent ? parent.clientWidth : 300);
      const dpr = window.devicePixelRatio || 1;

      if (cv.width !== W * dpr || cv.height !== H * dpr) {
        cv.width = W * dpr;
        cv.height = H * dpr;
        cv.style.width = W + 'px';
        cv.style.height = H + 'px';
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const r = H / 2;

      // Outer pill background (Light, modern theme matching Slimora)
      rr(0.5, 0.5, W - 1, H - 1, r);
      ctx.fillStyle = '#E8F1FC';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#CADDF2';
      ctx.stroke();

      const text = Math.round(state.shown * 100) + '%';
      const font = '700 11.5px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

      // 1. Draw base text in dark navy (#183863) for the unfilled light background
      ctx.fillStyle = '#183863';
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, W / 2, H / 2);

      const p = Math.max(0, Math.min(1, state.shown));
      const fillW = W * p;

      if (fillW > 2) {
        ctx.save();
        rr(0, 0, W, H, r);
        ctx.clip();

        // Gradient fill (Teal to Purple)
        const g = ctx.createLinearGradient(0, 0, fillW, 0);
        g.addColorStop(0, `rgb(${cA.join(',')})`);
        g.addColorStop(1, `rgb(${cB.join(',')})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, fillW, H);

        // Animated diagonal stripes (proportional to 24px)
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, fillW, H);
        ctx.clip();
        const sp = 12;
        const sw = 5;
        const off = (state.t * 32) % sp;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        for (let x = -H - sp + off; x < fillW + H; x += sp) {
          ctx.beginPath();
          ctx.moveTo(x, H);
          ctx.lineTo(x + H, 0);
          ctx.lineTo(x + H + sw, 0);
          ctx.lineTo(x + sw, H);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();

        // Shimmer / gleam passing across
        const sx = (state.t * 120) % (W + 80) - 40;
        const sg = ctx.createLinearGradient(sx - 40, 0, sx + 40, 0);
        sg.addColorStop(0, 'rgba(255, 255, 255, 0)');
        sg.addColorStop(0.5, 'rgba(255, 255, 255, 0.35)');
        sg.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, fillW, H);

        // Pulsing head glow dot at the leading edge
        if (p < 0.999) {
          const pulse = 0.5 + 0.5 * Math.sin(state.t * 6);
          const hx = fillW;
          const hy = H / 2;
          const rings = [
            [7 + pulse * 1.5, 0.08],
            [4.5 + pulse, 0.22],
            [2.2, 0.95],
          ];
          for (let i = 0; i < rings.length; i++) {
            const [rad, a] = rings[i];
            ctx.beginPath();
            ctx.arc(hx, hy, rad, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(180, 255, 240, ${a})`;
            ctx.fill();
          }
        }

        // 2. Draw text in crisp white over the filled area (clipped to fillW)
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, fillW, H);
        ctx.clip();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, W / 2, H / 2);
        ctx.restore();

        ctx.restore();
      }

      animId = requestAnimationFrame(frame);
    }

    stateRef.current.last = performance.now();
    animId = requestAnimationFrame(frame);

    return () => {
      if (animId) {
        cancelAnimationFrame(animId);
      }
    };
  }, [height]);

  return (
    <div style={{ width: '100%', height: `${height}px`, display: 'flex', alignItems: 'center' }}>
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: `${height}px` }} />
    </div>
  );
}
