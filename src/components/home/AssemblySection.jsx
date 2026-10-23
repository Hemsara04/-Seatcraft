import { useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const STEPS = [
  { title: 'Lay the foundation', text: 'Sketch your venue. Drag round, rectangular and square tables onto an open canvas, rotate them and number them.', part: 'Walnut legs & rose-gold feet' },
  { title: 'Give it a seat', text: 'Bring your people in. Type names, paste a list, or import the RSVP spreadsheet you already have.', part: 'Apron & seat base' },
  { title: 'Build the support', text: 'Track who’s confirmed, pending or declined. Group families together and note meals and dietary needs.', part: 'Channel-tufted back' },
  { title: 'Make it personal', text: 'Drag each guest onto a chair. Every table shows how full it is, so nobody is left standing.', part: 'Velvet cushion & card' },
  { title: 'Set the table', text: 'Share a private link with your planner, venue or caterer, or print the chart as a PDF.', part: 'Table for eight' },
];
// Scroll progress at which each step becomes active (matches the stage timing in assemblyScene.js).
const THRESHOLDS = [0, 0.24, 0.44, 0.64, 0.84];

/**
 * "Introducing Seatcraft": a pinned, dark section where a 3D chair assembles as you scroll.
 * The copy and HUD render immediately; the Three.js scene is loaded on demand.
 */
export default function AssemblySection() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const pctRef = useRef(null);
  const partsRef = useRef(null);
  const stageLabelRef = useRef(null);
  const barRef = useRef(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let api = null;
    let disposed = false;
    let progress = reduce ? 1 : 0;
    let lastStep = -1;
    const steps = Array.from(section.querySelectorAll('.assembly-step'));

    const update = (p) => {
      progress = p;
      const done = api ? api.setProgress(p) : 0;
      const step = THRESHOLDS.reduce((acc, t, i) => (p >= t ? i : acc), 0);
      if (step !== lastStep) {
        steps.forEach((el, i) => {
          el.classList.toggle('is-active', i === step);
          el.classList.toggle('is-done', i < step);
        });
        if (stageLabelRef.current) stageLabelRef.current.textContent = `${String(step + 1).padStart(2, '0')} — ${STEPS[step].part}`;
        lastStep = step;
      }
      if (pctRef.current) pctRef.current.textContent = String(Math.round(p * 100)).padStart(3, '0');
      if (partsRef.current && api) partsRef.current.textContent = `${String(done).padStart(2, '0')} / ${api.total}`;
      if (barRef.current) barRef.current.style.transform = `scaleY(${p})`;
      section.classList.toggle('is-started', p > 0.02);
    };

    import('./assemblyScene.js')
      .then(({ createAssemblyScene }) => {
        if (disposed) return;
        try {
          api = createAssemblyScene(stageRef.current, { reducedMotion: reduce });
          update(progress);
        } catch (err) {
          console.warn('[assembly] WebGL unavailable, showing static section', err);
          stageRef.current?.classList.add('is-fallback');
        }
      })
      .catch(() => stageRef.current?.classList.add('is-fallback'));

    if (reduce) {
      update(1);
      return () => {
        disposed = true;
        api?.dispose();
      };
    }

    const ctx = gsap.context(() => {
      const proxy = { p: 0 };
      gsap.to(proxy, {
        p: 1,
        ease: 'none',
        onUpdate: () => update(proxy.p),
        scrollTrigger: { trigger: section, start: 'top top', end: '+=400%', pin: true, scrub: 1, anticipatePin: 1 },
      });
      // Darken the sticky nav while it sits over this section.
      ScrollTrigger.create({
        trigger: section,
        start: 'top 64px',
        end: () => `+=${window.innerHeight * 5 - 64}`,
        toggleClass: { targets: '.nav', className: 'is-dark' },
      });
      gsap.from('.assembly-head > *', {
        y: 50,
        opacity: 0,
        duration: 1.1,
        stagger: 0.12,
        ease: 'power4.out',
        scrollTrigger: { trigger: section, start: 'top 75%' },
      });
    }, section);
    update(0);
    // The pin adds scroll space; let triggers further down the page recalculate.
    requestAnimationFrame(() => ScrollTrigger.refresh());

    return () => {
      disposed = true;
      ctx.revert();
      api?.dispose();
    };
  }, []);

  return (
    <section className="assembly" id="intro" ref={sectionRef} aria-labelledby="assembly-title">
      <div className="assembly-blueprint" aria-hidden="true" />
      <div className="assembly-stage" ref={stageRef} aria-hidden="true" />

      <div className="assembly-copy">
        <div className="assembly-head">
          <p className="assembly-eyebrow"><span aria-hidden="true">●</span> Introducing Seatcraft</p>
          <h2 id="assembly-title">
            The <em>calm</em> way to solve the seating puzzle.
          </h2>
          <p className="assembly-lead">A seating chart is built like a good chair: one sturdy piece at a time. Scroll to see how it comes together.</p>
        </div>

        <div className="assembly-steps">
          <div className="assembly-rail" aria-hidden="true">
            <span ref={barRef} />
          </div>
          <ol>
            {STEPS.map((s, i) => (
              <li key={s.title} className={`assembly-step${i === 0 ? ' is-active' : ''}`}>
                <span className="assembly-num">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <dl className="assembly-hud" aria-hidden="true">
        <div><dt>assembly</dt><dd><span ref={pctRef}>000</span>%</dd></div>
        <div><dt>parts</dt><dd ref={partsRef}>00 / 22</dd></div>
        <div><dt>stage</dt><dd ref={stageLabelRef}>01 — Walnut legs & rose-gold feet</dd></div>
      </dl>

      <div className="assembly-hint" aria-hidden="true">
        <span>Scroll to assemble</span>
        <i />
      </div>
    </section>
  );
}
