// D14 — audio curves: the fader law, the equal-power Audio Follow crossfade, and the
// A/V Synchro threshold. Plotted straight from src/core/audio.ts and src/core/av-synchro.ts.
//
// This is the "A" of A/V mixer, and it is the reason the site has an off-spine page at
// all: none of it sits on the video signal path, and all of it is modelled.

import {
  FADER_UNITY,
  FADER_GMAX,
  faderGain,
  faderDb,
  audioFollowGains,
  AUDIO_FOLLOW_EXCLUDED,
  linearToDb,
  ZERO_DB_LED,
  CLIP_CEILING_DB,
  nearZeroDb,
  isClipped,
} from '../../src/core/audio.js';
import {
  avSynchroThreshold,
  avSynchroTriggered,
  ENVELOPE_SILENT,
  ENVELOPE_QUIET,
  ENVELOPE_MODERATE,
  ENVELOPE_LOUD,
} from '../../src/core/av-synchro.js';
import { DemoElement, defineDemo, range, field, canvas2d, token, caption } from './base.js';

function plot(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  curves: Array<{ f: (x: number) => number; colour: string; label: string }>,
  marker: number | null,
): void {
  const padX = 40;
  const padY = 20;
  const gw = w - padX * 2;
  const gh = h - padY * 2;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = token('--mx-line');
  ctx.lineWidth = 1;
  ctx.strokeRect(padX + 0.5, padY + 0.5, gw - 1, gh - 1);
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(padX + gw / 2, padY);
  ctx.lineTo(padX + gw / 2, padY + gh);
  ctx.stroke();
  ctx.setLineDash([]);

  for (let c = 0; c < curves.length; c++) {
    const cur = curves[c]!;
    ctx.strokeStyle = cur.colour;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const x = i / 120;
      const y = Math.max(0, Math.min(1, cur.f(x)));
      const px = padX + x * gw;
      const py = padY + gh - y * gh;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  if (marker !== null) {
    ctx.strokeStyle = token('--mx-red');
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX + marker * gw, padY);
    ctx.lineTo(padX + marker * gw, padY + gh);
    ctx.stroke();
  }
}

class AudioCurves extends DemoElement {
  protected render(): void {
    let fader = FADER_UNITY;
    let lever = 0.5;
    let level = 0.5;
    let envelope = ENVELOPE_MODERATE;

    const faderPlot = canvas2d(460, 150);
    const followPlot = canvas2d(460, 150);
    const faderOut = document.createElement('div');
    const followOut = document.createElement('div');
    const synchroOut = document.createElement('div');

    const faderCtl = range({
      min: 0,
      max: 1,
      step: 0.005,
      value: fader,
      label: 'Fader travel',
      onInput: (v) => {
        fader = v;
        paint();
      },
    });
    const leverCtl = range({
      min: 0,
      max: 1,
      step: 0.005,
      value: lever,
      label: 'Mix/Wipe lever',
      onInput: (v) => {
        lever = v;
        paint();
      },
    });
    const levelCtl = range({
      min: 0,
      max: 1,
      step: 0.01,
      value: level,
      label: 'A/V Synchro LEVEL',
      onInput: (v) => {
        level = v;
        paint();
      },
    });
    const envCtl = range({
      min: 0,
      max: 1,
      step: 0.01,
      value: envelope,
      label: 'Audio envelope',
      onInput: (v) => {
        envelope = v;
        paint();
      },
    });

    const paint = (): void => {
      // Fader law — normalise gain into the plot by its max (+12 dB).
      plot(
        faderPlot.ctx,
        faderPlot.w,
        faderPlot.h,
        [{ f: (x) => faderGain(x) / FADER_GMAX, colour: token('--mx-amber'), label: 'gain' }],
        fader,
      );
      const db = faderDb(fader);
      faderOut.innerHTML =
        `<div class="mx-row" style="gap:10px;margin:10px 0 0">
           <div class="mx-readout">${fader <= 0 ? '−∞' : db.toFixed(2)} dB</div>
           <div class="mx-readout muted">gain ${faderGain(fader).toFixed(3)}</div>
           ${nearZeroDb(db) && fader > 0 ? '<span class="mx-chip ok"><span class="led"></span>0 dB</span>' : ''}
           ${isClipped(db) ? '<span class="mx-chip live"><span class="led"></span>above ceiling</span>' : ''}
         </div>
         <p class="mx-dim" style="margin:8px 0 0;font-size:13px">Unity sits at travel ${FADER_UNITY}; the top is
         +${linearToDb(FADER_GMAX).toFixed(0)} dB. Equal travel means equal dB — an exponential law, not a raw multiply.
         The 0 dB LED lights within ±1.5 dB (<code>nearZeroDb</code>), and <code>isClipped</code> flags anything above
         ${CLIP_CEILING_DB} dB (LED reference ${ZERO_DB_LED}).</p>`;

      // Audio Follow — equal power, so a+b stays constant in power terms.
      plot(
        followPlot.ctx,
        followPlot.w,
        followPlot.h,
        [
          { f: (x) => audioFollowGains(x).a, colour: token('--mx-label'), label: 'A' },
          { f: (x) => audioFollowGains(x).b, colour: token('--mx-amber'), label: 'B' },
          {
            f: (x) => {
              const g = audioFollowGains(x);
              return Math.sqrt(g.a * g.a + g.b * g.b);
            },
            colour: token('--mx-green'),
            label: 'power',
          },
        ],
        lever,
      );
      const g = audioFollowGains(lever);
      const excluded: string[] = [];
      for (let i = 0; i < AUDIO_FOLLOW_EXCLUDED.length; i++) excluded.push(AUDIO_FOLLOW_EXCLUDED[i]!);
      followOut.innerHTML =
        `<div class="mx-row" style="gap:10px;margin:10px 0 0">
           <div class="mx-readout">A ${g.a.toFixed(3)}</div>
           <div class="mx-readout">B ${g.b.toFixed(3)}</div>
           <div class="mx-readout muted">√(A²+B²) ${Math.sqrt(g.a * g.a + g.b * g.b).toFixed(3)}</div>
         </div>
         <p class="mx-dim" style="margin:8px 0 0;font-size:13px">Green is total power: flat across the whole travel,
         which is what stops a crossfade dipping in the middle. <code>${excluded.join('</code> and <code>')}</code>
         are excluded from Audio Follow and keep their own faders.</p>`;

      // A/V Synchro
      const threshold = avSynchroThreshold(level);
      const triggered = avSynchroTriggered(level, envelope);
      const marks: Array<[string, number]> = [
        ['silent', ENVELOPE_SILENT],
        ['quiet', ENVELOPE_QUIET],
        ['moderate', ENVELOPE_MODERATE],
        ['loud', ENVELOPE_LOUD],
      ];
      const chips: string[] = [];
      for (let i = 0; i < marks.length; i++) {
        const [name, v] = marks[i]!;
        chips.push(
          `<span class="mx-chip ${avSynchroTriggered(level, v) ? 'on' : ''}"><span class="led"></span>${name} ${v}</span>`,
        );
      }
      synchroOut.innerHTML =
        `<div class="mx-row" style="gap:10px;margin:10px 0">
           <div class="mx-readout">threshold ${threshold.toFixed(3)}</div>
           <div class="mx-readout" style="color:${triggered ? 'var(--mx-red)' : 'var(--mx-label)'}">
             ${triggered ? 'EFFECT PULSED ON' : 'below threshold'}</div>
         </div>
         <div class="mx-chips">${chips.join('')}</div>
         <p class="mx-dim" style="margin:8px 0 0;font-size:13px">Turning LEVEL toward MAX rejects all but the loudest
         peaks; toward MIN, quiet sounds trigger too. Hold time equals the time above threshold — except Strobe, which
         is governed by the Effect Interval Timer instead.</p>`;
    };

    const s1 = document.createElement('div');
    s1.innerHTML = `<span class="mx-label">Fader law</span>`;
    s1.appendChild(field('Fader travel', faderCtl));
    s1.appendChild(faderPlot.canvas);
    s1.appendChild(faderOut);

    const s2 = document.createElement('div');
    s2.style.marginTop = '26px';
    s2.innerHTML = `<span class="mx-label">Audio Follow — equal-power crossfade</span>`;
    s2.appendChild(field('Mix/Wipe lever', leverCtl));
    s2.appendChild(followPlot.canvas);
    s2.appendChild(followOut);

    const s3 = document.createElement('div');
    s3.style.marginTop = '26px';
    s3.innerHTML = `<span class="mx-label">A/V Synchro — audio-gated effects</span>`;
    s3.appendChild(field('LEVEL', levelCtl));
    s3.appendChild(field('Incoming envelope', envCtl));
    s3.appendChild(synchroOut);

    this.appendChild(s1);
    this.appendChild(s2);
    this.appendChild(s3);
    this.appendChild(
      caption(
        'From <code>faderGain</code>, <code>faderDb</code>, <code>audioFollowGains</code>, ' +
          '<code>avSynchroThreshold</code> and <code>avSynchroTriggered</code>. No Web Audio context is opened ' +
          'here — these are the pure laws the engine applies.',
      ),
    );
    paint();
  }
}

defineDemo('mx-demo-audio', AudioCurves);
