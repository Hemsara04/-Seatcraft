import { lazy, Suspense, useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import AssemblySection from '../components/home/AssemblySection.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

gsap.registerPlugin(ScrollTrigger);

const HeroScene = lazy(() => import('../components/home/HeroScene.jsx'));

const FEATURES = [
  { title: 'Floor planner', text: 'Drag round, rectangular and square tables onto an open canvas, rotate them, and name or number each one.', icon: 'M4 4h7v7H4zM13 13h7v7h-7zM17.5 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM4 17.5h7' },
  { title: 'Guest list', text: 'Add guests one by one or paste a whole list. Rename, regroup or move people right up to the big day.', icon: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M15 3.1a4 4 0 0 1 0 7.8' },
  { title: 'Drag-and-drop seating', text: 'Drop guests straight onto seats. Every table shows its fill count, like 6/8, at a glance.', icon: 'M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20' },
  { title: 'Venue templates', text: 'Start from a classic wedding, banquet, party or workshop room and adjust it to your space.', icon: 'M3 3h18v18H3zM3 9h18M9 21V9' },
  { title: 'RSVP tracking', text: 'Mark invitations as sent and set each guest to Pending, Confirmed or Declined.', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11' },
  { title: 'Excel & CSV import', text: 'Upload a spreadsheet, match its columns to guest fields, and even seat people at their tables in one go.', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M10 9H8' },
  { title: 'Share & collaborate', text: 'Send a private link your venue, planner or caterer can open in any browser, and invite up to 10 collaborators.', icon: 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4' },
  { title: 'Print-ready exports', text: 'Download the layout as a crisp PNG or PDF, and the guest list as a PDF grouped by table.', icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3' },
  { title: 'Never lose a change', text: 'Everything autosaves in your browser. Refresh or close the tab and your plan is exactly where you left it.', icon: 'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2zM17 21v-8H7v8M7 3v5h8' },
];

const STEPS = [
  { n: '01', title: 'Sketch the room', text: 'Pick a venue template or start blank. Drag tables in, rotate them, add the dance floor, bar and stage.' },
  { n: '02', title: 'Bring your guests', text: 'Type names, paste a list or import your RSVP spreadsheet. Track who’s confirmed as replies come in.' },
  { n: '03', title: 'Seat everyone', text: 'Drag guests onto seats, swap them around, then share the link or print the chart for the venue.' },
];

function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  const root = useRef(null);

  useLayoutEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ctx = gsap.context(() => {
      if (reduce) return;
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
      tl.from('.nav', { y: -30, opacity: 0, duration: 0.7 })
        .from('.hero-kicker', { y: 20, opacity: 0, duration: 0.6 }, '-=0.3')
        .from('.hero-title .line > span', { yPercent: 110, duration: 1, stagger: 0.12 }, '-=0.4')
        .from('.hero-sub', { y: 20, opacity: 0, duration: 0.7 }, '-=0.6')
        .from('.hero-ctas > *', { y: 16, opacity: 0, duration: 0.6, stagger: 0.08 }, '-=0.5')
        .from('.hero-card', { y: 30, opacity: 0, duration: 0.8, stagger: 0.12 }, '-=0.4');

      gsap.utils.toArray('.reveal').forEach((el) => {
        gsap.from(el, { y: 40, opacity: 0, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%' } });
      });
      gsap.from('.feature', { y: 40, opacity: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out', scrollTrigger: { trigger: '.features-grid', start: 'top 80%' } });
      gsap.from('.step', { y: 50, opacity: 0, duration: 0.8, stagger: 0.15, ease: 'power3.out', scrollTrigger: { trigger: '.steps', start: 'top 80%' } });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div className="home" ref={root}>
      <a href="#main" className="skip-link">Skip to content</a>
      <header className="nav">
        <Link to="/" className="brand" aria-label="Seatcraft home">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Seatcraft</span>
        </Link>
        <nav aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <ThemeToggle />
          <Link to="/plan" className="btn btn-primary btn-sm">Start planning</Link>
        </nav>
      </header>

      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <p className="hero-kicker">Seating plans for weddings, parties & every occasion</p>
            <h1 className="hero-title">
              <span className="line"><span>Every guest,</span></span>
              <span className="line"><span><em>perfectly</em> placed.</span></span>
            </h1>
            <p className="hero-sub">
              Design your venue, seat your guests with drag-and-drop, track RSVPs and share the chart with your planner — free, in the browser, no account needed.
            </p>
            <div className="hero-ctas">
              <Link to="/plan" className="btn btn-primary btn-lg">Plan my seating</Link>
              <a href="#how" className="btn btn-lg btn-ghost">See how it works</a>
            </div>
            <ul className="hero-proof" aria-label="Highlights">
              <li className="hero-card"><strong>3</strong><span>table shapes</span></li>
              <li className="hero-card"><strong>10</strong><span>collaborators</span></li>
              <li className="hero-card"><strong>0</strong><span>installs</span></li>
            </ul>
          </div>
          <div className="hero-visual">
            <Suspense fallback={<div className="hero-scene is-fallback" />}>
              <HeroScene />
            </Suspense>
            <div className="floating-tag tag-a" aria-hidden="true"><span className="dot dot-confirmed" />Table 4 · 8/8</div>
            <div className="floating-tag tag-b" aria-hidden="true"><span className="dot dot-pending" />Aunt May · Pending</div>
          </div>
        </section>

        <AssemblySection />

        <section className="features" id="features" aria-labelledby="features-title">
          <div className="section-head-lg reveal">
            <p className="eyebrow">Everything in one place</p>
            <h2 id="features-title">From first sketch to final place cards.</h2>
          </div>
          <div className="features-grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="feature">
                <span className="feature-icon"><Icon d={f.icon} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="how" id="how" aria-labelledby="how-title">
          <div className="section-head-lg reveal">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title">Three steps to a finished chart.</h2>
          </div>
          <ol className="steps">
            {STEPS.map((s) => (
              <li key={s.n} className="step">
                <span className="step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="privacy reveal">
          <div>
            <p className="eyebrow">Private by design</p>
            <h2>Your guest list stays yours.</h2>
            <p>
              Plans are saved in your own browser and in files you control. Share links carry the plan inside the link itself — nothing is uploaded to our servers.
            </p>
          </div>
          <Link to="/plan" className="btn btn-primary btn-lg">Open the planner</Link>
        </section>
      </main>

      <footer className="footer">
        <span className="brand-name">Seatcraft</span>
        <span className="muted">Made for couples, hosts and planners.</span>
      </footer>
    </div>
  );
}
