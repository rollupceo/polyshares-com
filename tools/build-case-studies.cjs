/*
 * Case-studies generator.
 *
 * Single source of truth for the Case Studies index (case-studies.html) and the
 * per-case-study detail pages (case-*.html). Edit the CASES array below and run:
 *
 *     node tools/build-case-studies.cjs
 *
 * The generated HTML is committed, so the static site needs no build step to
 * deploy — this script only exists to keep the pages consistent and to make
 * adding a new case study a one-object edit.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ------------------------------------------------------------------ data --- */
const CASES = [
  {
    slug: 'case-roofer',
    tag: 'AI Platform Build',
    cat: 'ai-platform',
    name: 'Roofer.com',
    meta: 'PE-backed roofing platform · $21.5M raised',
    metricBig: '$150K–$300K',
    metricUnit: 'EBITDA / location / yr',
    blurb: 'Drone + AI inspection platform. Enterprise parity, proprietary stack.',
    lead: 'A drone-and-AI inspection platform built to enterprise parity on a proprietary stack — turning roof inspection from a cost center into a margin engine and a multiple-expansion story at exit.',
    bullets: [
      '~60% inspection cost reduction',
      '$90B AUM asset manager onboarded',
      '3 new revenue streams created',
      'Multiple expansion story at exit',
    ],
    rollupHead: ['Platform Size', 'EBITDA Impact', 'EV (8–10x)'],
    rollup: [
      ['25 locations', '$3.75M – $7.5M', '$30M – $75M'],
      ['50 locations', '$7.5M – $15M', '$60M – $150M'],
      ['100 locations', '$15M – $30M', '$120M – $300M'],
    ],
  },
  {
    slug: 'case-canopy',
    tag: 'AI Automation',
    cat: 'automation',
    name: 'Canopy Roof & Restoration',
    meta: 'Owner-operated home services · roofing & restoration',
    metricBig: '$50K–$90K',
    metricUnit: 'EBITDA / location / yr',
    blurb: '$55K/yr admin replaced with AI. 24/7 coverage at $5K/yr.',
    lead: 'A full-time admin role replaced with AI that answers around the clock — $55K/yr of labor swapped for $5K/yr of coverage, deployed the same day with zero disruption to the business.',
    bullets: [
      '$50K direct labor savings per location',
      '15–25% lead capture lift',
      '24/7 coverage including evenings & weekends',
      'Same-day implementation, zero disruption',
    ],
    rollupHead: ['Platform Size', 'EBITDA Impact', 'EV (8–10x)'],
    rollup: [
      ['25 locations', '$1.5M – $2.25M', '$12M – $22.5M'],
      ['50 locations', '$3M – $4.5M', '$24M – $45M'],
      ['100 locations', '$6M – $9M', '$48M – $90M'],
    ],
  },
  {
    slug: 'case-multi-brand',
    tag: 'AI Automation',
    cat: 'automation',
    name: 'Multi-Brand Platform',
    meta: 'PE-backed roll-up · multiple acquired brands',
    metricBig: '$80K–$200K',
    metricUnit: 'EBITDA / location / yr',
    blurb: 'One AI agent across every system. Admin headcount eliminated platform-wide.',
    lead: 'One AI agent operating across every acquired brand and every system — eliminating admin headcount platform-wide and giving the sponsor real-time, cross-brand visibility from day one of each acquisition.',
    bullets: [
      '1–2 hires eliminated per acquired brand',
      '$50K–$200K middleware cost removed',
      'Real-time cross-brand data visibility',
      'Day-one plug-in for every new acquisition',
    ],
    rollupHead: ['Platform Size', 'EBITDA Impact', 'EV (8–10x)'],
    rollup: [
      ['25 locations', '$2M – $5M', '$16M – $50M'],
      ['50 locations', '$4M – $10M', '$32M – $100M'],
      ['100 locations', '$8M – $20M', '$64M – $200M'],
    ],
  },
  {
    slug: 'case-bearded-brothers',
    tag: 'Bespoke Build',
    cat: 'bespoke',
    name: 'Bearded Brothers Roofing',
    meta: 'Owner-operated home services · roofing',
    metricBig: '$26K–$50K',
    metricUnit: 'Direct savings / location / yr',
    blurb: 'Custom ERP live in 30 days. Zero vendor lock-in.',
    lead: 'A bespoke ERP that replaced a $75/user/month legacy system with a $2/user/month build the client owns outright — live in 30 days, full IP, zero vendor lock-in.',
    bullets: [
      '$2/user/month vs $75/user/month legacy system',
      '$26K/yr direct savings (30-seat)',
      'Full IP ownership, zero vendor lock-in',
      '30 days from kickoff to live',
    ],
    rollupHead: ['Platform Size', 'EBITDA Impact', 'EV (8–10x)'],
    rollup: [
      ['25 locations', '$750K – $1.25M', '$6M – $12.5M'],
      ['50 locations', '$1.5M – $2.5M', '$12M – $25M'],
      ['100 locations', '$3M – $5M', '$24M – $50M'],
    ],
  },
  {
    slug: 'case-simplicity-scheduling',
    tag: 'Bespoke Build',
    cat: 'bespoke',
    name: 'Simplicity Power',
    meta: 'Residential installation · $35M revenue · acquired by NXT Level Homes, 2025',
    metricBig: '~$624K',
    metricUnit: 'Annual EBITDA impact',
    blurb: 'Scheduling engine replaces guesswork with math. $12K/week in hidden labor — recovered.',
    lead: 'A scheduling engine that replaces dispatcher guesswork with an ILP solver — optimizing crew-to-job assignment across cost, skill and geography, and recovering $12K/week of hidden labor inefficiency at a single $35M-revenue operator.',
    bullets: [
      'ILP solver optimizes crew-to-job assignment across cost, skill & geography',
      '$12K/week in labor inefficiency eliminated on day one',
      'Dozens of construction-manager hours returned per week',
      'Deployed and live within the engagement',
    ],
    scale: {
      eyebrow: 'The business case',
      leadHtml: 'A single <em>middle-market</em> operator.',
      head: ['Metric', 'Result'],
      rows: [
        ['Labor inefficiency recovered', '$12K / week'],
        ['Annualized EBITDA impact', '~$624K / year'],
        ['Construction-manager hours returned', 'Dozens / week'],
        ['Business revenue', '$35M'],
        ['Time to live', 'Within the engagement'],
      ],
      note: 'Figures reflect a single ~$35M-revenue operator — not a portfolio rollup.',
    },
    related: { slug: 'case-simplicity-invoicing', label: 'Invoice verification at Simplicity Power' },
  },
  {
    slug: 'case-simplicity-invoicing',
    tag: 'Workflow Automation',
    cat: 'automation',
    name: 'Simplicity Power',
    meta: 'Residential installation · $35M revenue · acquired by NXT Level Homes, 2025',
    metricBig: '$104K–$156K',
    metricUnit: 'Annual EBITDA impact',
    blurb: 'Supplier invoice verification. Expert judgment automated, offshore-executable.',
    lead: 'Supplier invoice verification turned into an automated check against contracted pricing — moving expert judgment off the senior construction manager and onto an offshore bookkeeper, with no loss of accuracy, at a single $35M-revenue operator.',
    bullets: [
      'Every supplier invoice auto-checked against contracted pricing',
      '$2–3K/week in mispricing and overbilling recovered',
      'Review moved from senior CM to offshore bookkeeper — same accuracy',
      'Repeatable every week with no added senior headcount',
    ],
    scale: {
      eyebrow: 'The business case',
      leadHtml: 'A single <em>middle-market</em> operator.',
      head: ['Metric', 'Result'],
      rows: [
        ['Mispricing & overbilling recovered', '$2–3K / week'],
        ['Annualized EBITDA impact', '$104K–$156K / year'],
        ['Review cost', 'Senior CM → offshore bookkeeper'],
        ['Business revenue', '$35M'],
      ],
      note: 'Figures reflect a single ~$35M-revenue operator — not a portfolio rollup.',
    },
    related: { slug: 'case-simplicity-scheduling', label: 'Scheduling engine at Simplicity Power' },
  },
  {
    slug: 'case-solar',
    tag: 'Ops Redesign + Build',
    cat: 'ops',
    name: 'Confidential Solar Installer',
    meta: 'Residential solar · $50M revenue · 1,600 installs/yr',
    metricBig: '$300K–$550K',
    metricUnit: 'EBITDA / location / yr',
    blurb: 'Post-install visits cut in half. $1.76M/yr — plus $1.5M cash unlocked on day one.',
    lead: 'An operations redesign and supporting build that halved post-install service visits and compressed the cash conversion cycle — $1.76M/yr in recurring impact, plus $1.5M+ of one-time cash unlocked from the funding backlog.',
    bullets: [
      'Post-install visits per job reduced from 4 to 2',
      'Cost per service call cut from $550 to $350',
      'Cash conversion cycle shortened by 35 days',
      '$1.5M+ one-time cash unlocked from the funding backlog',
    ],
    rollupHead: ['Platform Size', 'EBITDA Impact', 'EV (8–10x)'],
    rollup: [
      ['5 locations', '$1.5M – $2.75M', '$12M – $27.5M'],
      ['10 locations', '$3M – $5.5M', '$24M – $55M'],
      ['25 locations', '$7.5M – $13.75M', '$60M – $137.5M'],
    ],
  },
];

const FILTERS = [
  { f: 'all', label: 'All' },
  { f: 'ai-platform', label: 'AI Platform' },
  { f: 'automation', label: 'Automation' },
  { f: 'bespoke', label: 'Bespoke Build' },
  { f: 'ops', label: 'Ops Redesign' },
];

/* -------------------------------------------------------------- partials --- */
const head = ({ title, desc, canonical }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}" />
<link rel="canonical" href="${canonical}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${canonical}" />
<meta property="og:site_name" content="Polyshares" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="https://polyshares.com/assets/og-image.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(desc)}" />
<meta name="twitter:image" content="https://polyshares.com/assets/og-image.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="styles.css" />
<link rel="icon" href="/favicon.ico?v=2" sizes="any" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png?v=2" />
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />
<!-- Google Analytics: replace G-XXXXXXXXXX with your GA4 Measurement ID (analytics.google.com → Admin → Data Streams) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-XXXXXXXXXX');</script>
<script>document.documentElement.className+=' js'</script>
</head>
<body id="top">

<header id="hdr">
  <div class="wrap nav">
    <a class="brand" href="/"><svg viewBox="0 0 96 96" fill="none" aria-hidden="true"><rect x="18" y="18" width="42" height="42" stroke="currentColor" stroke-width="7"/><rect x="36" y="36" width="42" height="42" stroke="currentColor" stroke-width="7"/><path d="M60 28V44" stroke="currentColor" stroke-width="7"/></svg>Polyshares</a>
    <nav class="nav-links"><a href="services">Services</a><a href="acquisitions">Acquisitions</a><a href="case-studies" class="active">Case Studies</a><a href="about">Team</a></nav>
    <div class="nav-right"><a class="btn btn-ghost" href="https://calendly.com/polyshares/30min" target="_blank" rel="noopener">Book a 30-Min Call</a><button class="menu-btn" id="menuBtn" aria-label="Menu"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button></div>
  </div>
  <div class="mobile" id="mobile"><a href="services">Services</a><a href="acquisitions">Acquisitions</a><a href="case-studies">Case Studies</a><a href="about">Team</a><a class="btn" href="https://calendly.com/polyshares/30min" target="_blank" rel="noopener">Book a 30-Min Call</a></div>
</header>
`;

const footer = `
<footer><div class="wrap foot"><a class="brand" href="/">Polyshares</a><div class="links"><a href="services">Services</a><a href="acquisitions">Acquisitions</a><a href="case-studies">Case Studies</a><a href="about">Team</a><a href="https://www.linkedin.com/company/polyshares" target="_blank" rel="noopener">LinkedIn</a></div><div class="copy">© 2026 Polyshares, Inc</div></div></footer>
<script src="app.js"></script>
</body>
</html>
`;

const arrow = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

/* ------------------------------------------------------------ index page --- */
function buildIndex() {
  const filters = FILTERS.map((f, i) =>
    `<button class="fbtn${i === 0 ? ' active' : ''}" data-f="${f.f}">${esc(f.label)}</button>`
  ).join('');

  const cards = CASES.map((c) => `      <a class="cscard" data-cat="${c.cat}" href="${c.slug}">
        <span class="tag">${esc(c.tag)}</span>
        <h3>${esc(c.name)}</h3>
        <div class="meta">${esc(c.meta)}</div>
        <p class="blurb">${esc(c.blurb)}</p>
        <div class="foot">
          <span class="m"><b>${esc(c.metricBig)}</b><small>${esc(c.metricUnit)}</small></span>
          <span class="view">View case study ${arrow}</span>
        </div>
      </a>`).join('\n');

  return head({
    title: 'Case Studies | Polyshares',
    desc: 'Real deployments. Real numbers at platform scale — per-location EBITDA impact and what it means across a 25, 50, or 100-location portfolio.',
    canonical: 'https://polyshares.com/case-studies',
  }) + `
<section class="pagehead">
  <div class="wrap inner">
    <div class="eyebrow">AI Operating Partner · Case Studies</div>
    <h1>Real deployments. <em>Real numbers at platform scale.</em></h1>
    <p class="sub">Each case study shows per-location impact and what it means across a 25, 50, or 100-location portfolio — because that's the math that matters to a PE sponsor. Including deployments within founder-operated portfolio companies.</p>
  </div>
</section>

<section class="wrap reveal" style="padding-top:64px">
  <div class="csfilter" id="csfilter">${filters}</div>
  <div class="csgrid" id="csgrid">
${cards}
  </div>
  <p class="note">Portfolio figures assume an 8–10x EBITDA multiple at exit. Click any case study for the full breakdown.</p>
</section>

<section class="final">
  <div class="wrap">
    <div class="eyebrow">Your Operation</div>
    <h2>What would your <em>case study</em> look like?</h2>
    <p class="sub">The intro call is 30 minutes. We'll identify your highest-ROI opportunity and tell you exactly what we'd build and what result you should expect.</p>
    <a class="btn btn-light" href="https://calendly.com/polyshares/30min" target="_blank" rel="noopener">Book a 30-Minute Call</a>
  </div>
</section>
` + footer;
}

/* ----------------------------------------------------------- detail page --- */
function buildDetail(c) {
  const idx = CASES.indexOf(c);
  const next = CASES[(idx + 1) % CASES.length];

  const bullets = c.bullets.map((b) => `<li>${esc(b)}</li>`).join('');

  // Default cases use the platform-scale rollup; a case can override with its
  // own `scale` block (e.g. a single middle-market operator, not a rollup).
  const sc = c.scale || {
    eyebrow: 'At platform scale',
    leadHtml: 'What it means across a <em>portfolio.</em>',
    head: c.rollupHead,
    rows: c.rollup,
    note: 'EV assumes 8–10x EBITDA multiple at exit.',
  };
  const rollHead = sc.head.map((h) => `<th>${esc(h)}</th>`).join('');
  const rollBody = sc.rows
    .map((r) => `<tr>${r.map((d) => `<td>${esc(d)}</td>`).join('')}</tr>`)
    .join('');
  const noteHtml = sc.note ? `  <p class="note">${esc(sc.note)}</p>\n` : '';

  const related = c.related
    ? `      <a class="cs-related" href="${c.related.slug}"><span>Related engagement</span>${esc(c.related.label)} ${arrow}</a>\n`
    : '';

  return head({
    title: `${c.name} — Case Study | Polyshares`,
    desc: `${c.name}: ${c.blurb} ${c.metricBig} ${c.metricUnit}.`,
    canonical: `https://polyshares.com/${c.slug}`,
  }) + `
<section class="pagehead cs-detail-head">
  <div class="wrap inner">
    <a class="backlink" href="case-studies">${arrow.replace('M5 12h14M13 6l6 6-6 6', 'M19 12H5M11 18l-6-6 6-6')} All case studies</a>
    <div class="eyebrow">Case Study · ${esc(c.tag)}</div>
    <h1>${esc(c.name)}</h1>
    <p class="sub">${esc(c.meta)}</p>
    <div class="ph-stats">
      <div><div class="n">${esc(c.metricBig)}</div><div class="l">${esc(c.metricUnit)}</div></div>
    </div>
  </div>
</section>

<section class="wrap reveal" style="padding-bottom:0">
  <p class="intro-p">${esc(c.lead)}</p>
</section>

<section class="wrap reveal">
  <div class="sec-head"><div class="eyebrow lined">Highlights</div></div>
  <ul class="cs-bullets cs-bullets-lg">${bullets}</ul>
</section>

<section class="wrap reveal">
  <div class="sec-head"><div class="eyebrow lined">${esc(sc.eyebrow)}</div><h2 class="lead">${sc.leadHtml}</h2></div>
  <table class="rollup">
    <thead><tr>${rollHead}</tr></thead>
    <tbody>${rollBody}</tbody>
  </table>
${noteHtml}${related}  <div class="cs-nav">
    <a class="btn btn-outline" href="case-studies">← All case studies</a>
    <a class="btn btn-outline" href="${next.slug}">Next: ${esc(next.name)} →</a>
  </div>
</section>

<section class="final">
  <div class="wrap">
    <div class="eyebrow">Your Operation</div>
    <h2>What would your <em>case study</em> look like?</h2>
    <p class="sub">The intro call is 30 minutes. We'll identify your highest-ROI opportunity and tell you exactly what we'd build and what result you should expect.</p>
    <a class="btn btn-light" href="https://calendly.com/polyshares/30min" target="_blank" rel="noopener">Book a 30-Minute Call</a>
  </div>
</section>
` + footer;
}

/* ----------------------------------------------------------------- write --- */
fs.writeFileSync(path.join(ROOT, 'case-studies.html'), buildIndex());
let n = 1;
for (const c of CASES) {
  fs.writeFileSync(path.join(ROOT, `${c.slug}.html`), buildDetail(c));
  n++;
}
console.log(`Wrote case-studies.html + ${CASES.length} detail pages.`);
