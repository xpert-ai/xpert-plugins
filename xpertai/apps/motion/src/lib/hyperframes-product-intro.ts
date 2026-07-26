export interface HyperframesProductIntroFeature {
  title: string
  description: string
}

export interface HyperframesProductIntroProofPoint {
  value: string
  label: string
}

export interface HyperframesProductIntroInput {
  brandName: string
  tagline: string
  problem: string
  solution: string
  features: HyperframesProductIntroFeature[]
  proofPoints?: HyperframesProductIntroProofPoint[]
  cta: string
  website?: string | null
  duration?: number
  accentColor?: string
  secondaryColor?: string
  backgroundColor?: string
}

export const XPERT_AI_PRODUCT_INTRO: HyperframesProductIntroInput = {
  brandName: 'Xpert AI',
  tagline: 'Open-source enterprise Agent platform',
  problem: 'Enterprise AI needs more than a chatbot.',
  solution: 'Orchestrate agents, workflows, knowledge and governed actions in one platform.',
  features: [
    {
      title: 'Multi-agent orchestration',
      description: 'Build supervisor, hierarchical, swarm and custom agent teams.'
    },
    {
      title: 'Agentic BI & Data Xpert',
      description: 'Give agents governed semantic access, policies, approvals and audit.'
    },
    {
      title: 'Agentic Apps & Plugins',
      description: 'Ship tools, Skills, MCP, Workbench views and complete business apps.'
    },
    {
      title: 'Workbench & ChatKit',
      description: 'Keep humans in the loop and embed rich AI experiences anywhere.'
    }
  ],
  proofPoints: [
    { value: 'Open', label: 'Open source' },
    { value: 'Safe', label: 'Governed execution' },
    { value: 'Ready', label: 'Enterprise workflows' }
  ],
  cta: 'Build production-grade agent systems.',
  website: 'xpertai.cn',
  duration: 36,
  accentColor: '#7c3aed',
  secondaryColor: '#22d3ee',
  backgroundColor: '#050816'
}

/**
 * Builds a self-contained, seekable HyperFrames composition with six scenes.
 * It deliberately uses finite CSS animations and no remote resources so Player
 * preview and the network-isolated Producer render the same document.
 */
export function createProductIntroHyperframesComposition(input: HyperframesProductIntroInput): string {
  const duration = clamp(input.duration ?? 36, 24, 60)
  const accent = normalizeHexColor(input.accentColor, '#7c3aed')
  const secondary = normalizeHexColor(input.secondaryColor, '#22d3ee')
  const background = normalizeHexColor(input.backgroundColor, '#050816')
  const brandName = escapeHtml(input.brandName)
  const tagline = escapeHtml(input.tagline)
  const problem = escapeHtml(input.problem)
  const solution = escapeHtml(input.solution)
  const cta = escapeHtml(input.cta)
  const website = escapeHtml(input.website || '')
  const features = input.features.slice(0, 4)
  const proofPoints = (input.proofPoints?.length ? input.proofPoints : XPERT_AI_PRODUCT_INTRO.proofPoints ?? []).slice(0, 3)
  const sceneWindows = scaledSceneWindows(duration)
  const scene = (index: number) => sceneWindows[index]
  const featureCards = features
    .map((feature, index) => {
      const start = scene(3).start + 0.65 + index * 0.18
      return `<article class="feature-card enter" data-hf-id="feature-${index + 1}" data-start="${seconds(start)}" data-duration="${seconds(scene(3).end - start)}">
        <span class="feature-index">0${index + 1}</span>
        <div><h3>${escapeHtml(feature.title)}</h3><p>${escapeHtml(feature.description)}</p></div>
      </article>`
    })
    .join('\n')
  const proofCards = proofPoints
    .map((point, index) => {
      const start = scene(4).start + 0.85 + index * 0.2
      return `<div class="proof-card enter" data-hf-id="proof-${index + 1}" data-start="${seconds(start)}" data-duration="${seconds(scene(4).end - start)}">
        <strong>${escapeHtml(point.value)}</strong><span>${escapeHtml(point.label)}</span>
      </div>`
    })
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${brandName} — Product Introduction</title>
  <style>
    :root{--accent:${accent};--secondary:${secondary};--bg:${background};--ink:#f8fafc;--muted:#a8b3cf;--panel:rgba(15,23,42,.72)}
    *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg);font-family:Inter,"SF Pro Display","Segoe UI",Arial,sans-serif}
    body{color:var(--ink)}[data-composition-id]{position:relative;width:1920px;height:1080px;overflow:hidden;background:var(--bg);isolation:isolate}
    .ambient{position:absolute;inset:-20%;z-index:-4;background:radial-gradient(circle at 20% 20%,color-mix(in srgb,var(--accent) 32%,transparent),transparent 33%),radial-gradient(circle at 78% 75%,color-mix(in srgb,var(--secondary) 24%,transparent),transparent 30%),linear-gradient(145deg,var(--bg),#0b1026 60%,#050713);animation:ambient-drift ${seconds(duration)}s ease-in-out both}
    .grid{position:absolute;inset:0;z-index:-3;opacity:.14;background-image:linear-gradient(rgba(255,255,255,.16) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.16) 1px,transparent 1px);background-size:72px 72px;mask-image:linear-gradient(to bottom,transparent,black 18%,black 78%,transparent)}
    .grain{position:absolute;inset:0;z-index:30;pointer-events:none;opacity:.05;background-image:radial-gradient(#fff .7px,transparent .7px);background-size:5px 5px}
    .chrome{position:absolute;z-index:25;left:64px;right:64px;top:44px;display:flex;align-items:center;justify-content:space-between;font-size:20px;letter-spacing:.06em;color:#c7d2fe}
    .brand-lockup{display:flex;align-items:center;gap:18px;font-weight:760}.brand-mark{width:42px;height:42px;color:var(--ink)}.brand-mark svg{display:block;width:100%;height:100%;fill:currentColor}
    .chrome-right{display:flex;align-items:center;gap:14px}.live-dot{width:9px;height:9px;border-radius:50%;background:var(--secondary);box-shadow:0 0 22px var(--secondary)}
    .scene{position:absolute;inset:0;padding:144px 118px 106px;display:grid;align-items:center;opacity:0;visibility:hidden;animation:scene-life var(--scene-duration) linear both}
    .scene.final{animation-name:scene-final}.scene-copy{position:relative;z-index:4;max-width:1080px}.eyebrow{display:inline-flex;align-items:center;gap:12px;margin-bottom:28px;color:#c4b5fd;font-size:21px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
    .eyebrow:before{content:"";width:46px;height:2px;background:linear-gradient(90deg,var(--accent),var(--secondary))}
    h1,h2,h3,p{margin:0}h1{font-size:150px;line-height:.9;letter-spacing:-.068em;max-width:1500px}h2{font-size:94px;line-height:.98;letter-spacing:-.055em;max-width:1340px}
    .gradient-text{color:transparent;background:linear-gradient(100deg,#fff 5%,#c4b5fd 45%,#67e8f9 92%);background-clip:text}.lede{margin-top:36px;max-width:960px;font-size:34px;line-height:1.42;color:var(--muted)}
    .enter{animation:enter-up .9s cubic-bezier(.16,1,.3,1) both}.enter-soft{animation:enter-soft 1.1s cubic-bezier(.16,1,.3,1) both}
    .hero-orbit{position:absolute;right:120px;top:178px;width:580px;height:580px;border:1px solid rgba(148,163,184,.22);border-radius:50%;animation:orbit-pulse ${seconds(scene(0).duration)}s ease-in-out both}
    .hero-orbit:before,.hero-orbit:after{content:"";position:absolute;border-radius:50%;inset:72px;border:1px dashed rgba(103,232,249,.28);transform:rotate(28deg)}.hero-orbit:after{inset:176px;border-style:solid;background:radial-gradient(circle at 35% 28%,#fff,var(--secondary) 8%,var(--accent) 45%,transparent 70%);filter:drop-shadow(0 0 70px color-mix(in srgb,var(--accent) 60%,transparent))}
    .signal{position:absolute;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 0 28px var(--secondary)}.signal.a{left:58px;top:122px}.signal.b{right:38px;bottom:142px}.signal.c{left:252px;bottom:-8px}
    .problem-stack{position:absolute;right:116px;top:222px;width:640px;height:620px}.problem-card{position:absolute;width:410px;padding:25px 30px;border:1px solid rgba(148,163,184,.22);border-radius:22px;background:rgba(15,23,42,.72);backdrop-filter:blur(16px);box-shadow:0 30px 80px rgba(0,0,0,.28);font-size:25px;color:#dbeafe}
    .problem-card:nth-child(1){left:20px;top:0;transform:rotate(-6deg)}.problem-card:nth-child(2){right:0;top:178px;transform:rotate(5deg)}.problem-card:nth-child(3){left:54px;top:376px;transform:rotate(-2deg)}.problem-card small{display:block;margin-top:12px;color:#94a3b8;font-size:17px}
    .platform-window{position:absolute;right:92px;top:170px;width:900px;height:690px;border:1px solid rgba(148,163,184,.24);border-radius:30px;background:rgba(7,12,30,.82);box-shadow:0 45px 120px rgba(0,0,0,.4);overflow:hidden}
    .window-bar{height:58px;border-bottom:1px solid rgba(148,163,184,.16);display:flex;align-items:center;gap:9px;padding:0 22px}.window-bar i{width:10px;height:10px;border-radius:50%;background:#475569}.window-title{margin-left:16px;color:#94a3b8;font-size:16px}
    .canvas{position:relative;height:632px;background-image:radial-gradient(rgba(148,163,184,.26) 1px,transparent 1px);background-size:24px 24px}.node{position:absolute;width:210px;padding:21px;border:1px solid rgba(148,163,184,.22);border-radius:18px;background:#111a35;box-shadow:0 18px 50px rgba(0,0,0,.32)}.node strong{display:block;font-size:20px}.node span{display:block;margin-top:8px;color:#94a3b8;font-size:15px}.node .node-icon{width:32px;height:32px;margin-bottom:18px;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--secondary))}
    .node.n1{left:70px;top:230px}.node.n2{left:344px;top:90px}.node.n3{left:344px;top:356px}.node.n4{right:72px;top:230px}.connector{position:absolute;height:2px;transform-origin:left;background:linear-gradient(90deg,var(--accent),var(--secondary));box-shadow:0 0 13px var(--secondary);opacity:.72}.c1{left:270px;top:313px;width:164px;transform:rotate(-27deg)}.c2{left:270px;top:330px;width:160px;transform:rotate(27deg)}.c3{left:552px;top:187px;width:184px;transform:rotate(27deg)}.c4{left:552px;top:451px;width:182px;transform:rotate(-27deg)}
    .feature-grid{margin-top:58px;display:grid;grid-template-columns:repeat(2,1fr);gap:22px;max-width:1520px}.feature-card{min-height:172px;padding:30px 34px;border:1px solid rgba(148,163,184,.2);border-radius:24px;background:linear-gradient(135deg,rgba(30,41,59,.78),rgba(15,23,42,.54));display:flex;gap:25px}.feature-index{font-size:18px;color:var(--secondary);font-weight:800}.feature-card h3{font-size:30px;letter-spacing:-.02em}.feature-card p{margin-top:12px;color:var(--muted);font-size:20px;line-height:1.45}
    .flow{position:absolute;right:100px;top:212px;width:770px;height:580px}.flow-ring{position:absolute;inset:50px;border:1px solid rgba(148,163,184,.22);border-radius:50%;animation:flow-spin ${seconds(scene(4).duration)}s ease-in-out both}.flow-core{position:absolute;left:285px;top:205px;width:200px;height:200px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#fff,var(--secondary) 5%,var(--accent) 44%,#172554 74%);box-shadow:0 0 90px color-mix(in srgb,var(--accent) 55%,transparent);font-size:22px;font-weight:800}
    .flow-pill{position:absolute;padding:15px 20px;border:1px solid rgba(148,163,184,.22);border-radius:999px;background:#111a35;color:#dbeafe;font-weight:650}.flow-pill.p1{left:20px;top:92px}.flow-pill.p2{right:0;top:92px}.flow-pill.p3{left:14px;bottom:58px}.flow-pill.p4{right:4px;bottom:58px}
    .proof-row{display:flex;gap:18px;margin-top:50px}.proof-card{min-width:210px;padding:23px 26px;border-left:2px solid var(--secondary);background:rgba(15,23,42,.58)}.proof-card strong{display:block;font-size:29px}.proof-card span{display:block;margin-top:6px;color:#94a3b8;font-size:17px}
    .final-lockup{display:flex;flex-direction:column;align-items:center;text-align:center}.final-mark{width:150px;height:150px;margin-bottom:42px;color:#fff;filter:drop-shadow(0 0 46px color-mix(in srgb,var(--accent) 68%,transparent))}.final-mark svg{width:100%;height:100%;fill:currentColor}.final h2{font-size:108px;max-width:1420px}.final .lede{max-width:1120px}.website{margin-top:54px;padding:18px 34px;border:1px solid rgba(255,255,255,.2);border-radius:999px;color:#cffafe;font-size:27px;letter-spacing:.08em}
    .progress{position:absolute;z-index:40;left:0;bottom:0;height:7px;width:100%;transform-origin:left;background:linear-gradient(90deg,var(--accent),var(--secondary));animation:film-progress ${seconds(duration)}s linear both}
    @keyframes scene-life{0%{opacity:0;visibility:hidden;transform:scale(1.015)}10%{opacity:1;visibility:visible;transform:none}83%{opacity:1;visibility:visible;transform:none}100%{opacity:0;visibility:hidden;transform:scale(.99)}}
    @keyframes scene-final{0%{opacity:0;visibility:hidden;transform:scale(1.015)}12%{opacity:1;visibility:visible;transform:none}100%{opacity:1;visibility:visible;transform:none}}
    @keyframes enter-up{0%{opacity:0;transform:translate3d(0,44px,0);filter:blur(9px)}100%{opacity:1;transform:none;filter:none}}
    @keyframes enter-soft{0%{opacity:0;transform:scale(.94);filter:blur(14px)}100%{opacity:1;transform:none;filter:none}}
    @keyframes ambient-drift{0%{transform:translate3d(-2%,-2%,0) scale(1)}50%{transform:translate3d(3%,1%,0) scale(1.06)}100%{transform:translate3d(-1%,3%,0) scale(1.02)}}
    @keyframes orbit-pulse{0%{transform:rotate(-18deg) scale(.86);opacity:0}18%{opacity:1}100%{transform:rotate(18deg) scale(1.05);opacity:.82}}
    @keyframes flow-spin{0%{transform:rotate(-12deg) scale(.9);opacity:.2}20%{opacity:1}100%{transform:rotate(12deg) scale(1.03);opacity:.72}}
    @keyframes film-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}
  </style>
</head>
<body>
  <main data-composition-id="main" data-width="1920" data-height="1080" data-duration="${seconds(duration)}" data-no-timeline data-hf-id="xpert-product-intro">
    <div class="ambient" data-hf-id="ambient" data-start="0" data-duration="${seconds(duration)}"></div>
    <div class="grid" data-hf-id="grid"></div><div class="grain" data-hf-id="grain"></div>
    <header class="chrome" data-hf-id="chrome">
      <div class="brand-lockup">${markSvg('brand-mark')}<span data-hf-id="chrome-brand">${brandName}</span></div>
      <div class="chrome-right"><span class="live-dot"></span><span>Agentic systems, in motion</span></div>
    </header>

    <section class="scene scene-1" style="--scene-duration:${seconds(scene(0).duration)}s" data-scene-title="Brand reveal" data-hf-id="scene-brand" data-start="${seconds(scene(0).start)}" data-duration="${seconds(scene(0).duration)}">
      <div class="scene-copy">
        <div class="eyebrow enter" data-hf-id="brand-kicker" data-start="${seconds(scene(0).start + .25)}" data-duration="${seconds(scene(0).duration - .25)}">The enterprise Agent platform</div>
        <h1 class="gradient-text enter" data-hf-id="brand-title" data-start="${seconds(scene(0).start + .55)}" data-duration="${seconds(scene(0).duration - .55)}">${brandName}</h1>
        <p class="lede enter" data-hf-id="brand-tagline" data-start="${seconds(scene(0).start + .82)}" data-duration="${seconds(scene(0).duration - .82)}">${tagline}</p>
      </div>
      <div class="hero-orbit enter-soft" data-hf-id="hero-orbit" data-start="${seconds(scene(0).start + .35)}" data-duration="${seconds(scene(0).duration - .35)}"><i class="signal a"></i><i class="signal b"></i><i class="signal c"></i></div>
    </section>

    <section class="scene scene-2" style="--scene-duration:${seconds(scene(1).duration)}s" data-scene-title="Problem" data-hf-id="scene-problem" data-start="${seconds(scene(1).start)}" data-duration="${seconds(scene(1).duration)}">
      <div class="scene-copy">
        <div class="eyebrow enter" data-hf-id="problem-kicker" data-start="${seconds(scene(1).start + .2)}" data-duration="${seconds(scene(1).duration - .2)}">The challenge</div>
        <h2 class="enter" data-hf-id="problem-title" data-start="${seconds(scene(1).start + .45)}" data-duration="${seconds(scene(1).duration - .45)}">${problem}</h2>
        <p class="lede enter" data-hf-id="problem-copy" data-start="${seconds(scene(1).start + .75)}" data-duration="${seconds(scene(1).duration - .75)}">It needs context, coordination, control — and a clear path from intent to execution.</p>
      </div>
      <div class="problem-stack">
        <div class="problem-card enter" data-hf-id="problem-card-context" data-start="${seconds(scene(1).start + .5)}" data-duration="${seconds(scene(1).duration - .5)}">Scattered context<small>Files, knowledge, metrics and systems</small></div>
        <div class="problem-card enter" data-hf-id="problem-card-workflows" data-start="${seconds(scene(1).start + .72)}" data-duration="${seconds(scene(1).duration - .72)}">Fragile workflows<small>Prompts without deterministic control</small></div>
        <div class="problem-card enter" data-hf-id="problem-card-governance" data-start="${seconds(scene(1).start + .94)}" data-duration="${seconds(scene(1).duration - .94)}">Missing governance<small>Actions without review or audit</small></div>
      </div>
    </section>

    <section class="scene scene-3" style="--scene-duration:${seconds(scene(2).duration)}s" data-scene-title="Platform" data-hf-id="scene-platform" data-start="${seconds(scene(2).start)}" data-duration="${seconds(scene(2).duration)}">
      <div class="scene-copy" style="max-width:760px">
        <div class="eyebrow enter" data-hf-id="platform-kicker" data-start="${seconds(scene(2).start + .2)}" data-duration="${seconds(scene(2).duration - .2)}">One operating layer</div>
        <h2 class="enter" data-hf-id="platform-title" data-start="${seconds(scene(2).start + .45)}" data-duration="${seconds(scene(2).duration - .45)}">From prompt to <span class="gradient-text">production.</span></h2>
        <p class="lede enter" data-hf-id="platform-copy" data-start="${seconds(scene(2).start + .78)}" data-duration="${seconds(scene(2).duration - .78)}">${solution}</p>
      </div>
      <div class="platform-window enter-soft" data-hf-id="agent-builder" data-start="${seconds(scene(2).start + .38)}" data-duration="${seconds(scene(2).duration - .38)}">
        <div class="window-bar"><i></i><i></i><i></i><span class="window-title">Agent Studio · Customer Operations</span></div>
        <div class="canvas">
          <div class="connector c1"></div><div class="connector c2"></div><div class="connector c3"></div><div class="connector c4"></div>
          <div class="node n1"><div class="node-icon"></div><strong>Supervisor</strong><span>Plans and delegates</span></div>
          <div class="node n2"><div class="node-icon"></div><strong>Knowledge</strong><span>Grounded retrieval</span></div>
          <div class="node n3"><div class="node-icon"></div><strong>Workflow</strong><span>Deterministic control</span></div>
          <div class="node n4"><div class="node-icon"></div><strong>Workbench</strong><span>Human review</span></div>
        </div>
      </div>
    </section>

    <section class="scene scene-4" style="--scene-duration:${seconds(scene(3).duration)}s" data-scene-title="Capabilities" data-hf-id="scene-capabilities" data-start="${seconds(scene(3).start)}" data-duration="${seconds(scene(3).duration)}">
      <div class="scene-copy" style="max-width:1480px">
        <div class="eyebrow enter" data-hf-id="features-kicker" data-start="${seconds(scene(3).start + .18)}" data-duration="${seconds(scene(3).duration - .18)}">Built for real business systems</div>
        <h2 class="enter" data-hf-id="features-title" data-start="${seconds(scene(3).start + .42)}" data-duration="${seconds(scene(3).duration - .42)}">Everything agents need to do useful work.</h2>
        <div class="feature-grid">${featureCards}</div>
      </div>
    </section>

    <section class="scene scene-5" style="--scene-duration:${seconds(scene(4).duration)}s" data-scene-title="Governance" data-hf-id="scene-governance" data-start="${seconds(scene(4).start)}" data-duration="${seconds(scene(4).duration)}">
      <div class="scene-copy" style="max-width:850px">
        <div class="eyebrow enter" data-hf-id="governance-kicker" data-start="${seconds(scene(4).start + .18)}" data-duration="${seconds(scene(4).duration - .18)}">Open, extensible, governed</div>
        <h2 class="enter" data-hf-id="governance-title" data-start="${seconds(scene(4).start + .42)}" data-duration="${seconds(scene(4).duration - .42)}">Reason freely. Execute with confidence.</h2>
        <p class="lede enter" data-hf-id="governance-copy" data-start="${seconds(scene(4).start + .7)}" data-duration="${seconds(scene(4).duration - .7)}">Turn enterprise resources into typed tools, semantic objects, reviewable views and auditable flows.</p>
        <div class="proof-row">${proofCards}</div>
      </div>
      <div class="flow enter-soft" data-hf-id="governed-flow" data-start="${seconds(scene(4).start + .3)}" data-duration="${seconds(scene(4).duration - .3)}">
        <div class="flow-ring"></div><div class="flow-core">Xpert AI</div>
        <span class="flow-pill p1">Knowledge</span><span class="flow-pill p2">Tools</span><span class="flow-pill p3">Policies</span><span class="flow-pill p4">Apps</span>
      </div>
    </section>

    <section class="scene scene-6 final" style="--scene-duration:${seconds(scene(5).duration)}s" data-scene-title="Call to action" data-hf-id="scene-cta" data-start="${seconds(scene(5).start)}" data-duration="${seconds(scene(5).duration)}">
      <div class="final-lockup">
        <div class="final-mark enter-soft" data-hf-id="final-mark" data-start="${seconds(scene(5).start + .18)}" data-duration="${seconds(scene(5).duration - .18)}">${markSvg()}</div>
        <div class="eyebrow enter" data-hf-id="cta-kicker" data-start="${seconds(scene(5).start + .42)}" data-duration="${seconds(scene(5).duration - .42)}">${brandName}</div>
        <h2 class="gradient-text enter" data-hf-id="cta-title" data-start="${seconds(scene(5).start + .66)}" data-duration="${seconds(scene(5).duration - .66)}">${cta}</h2>
        <p class="lede enter" data-hf-id="cta-copy" data-start="${seconds(scene(5).start + .92)}" data-duration="${seconds(scene(5).duration - .92)}">${tagline}</p>
        ${website ? `<div class="website enter" data-hf-id="cta-website" data-start="${seconds(scene(5).start + 1.16)}" data-duration="${seconds(scene(5).duration - 1.16)}">${website}</div>` : ''}
      </div>
    </section>
    <div class="progress" data-hf-id="film-progress" data-start="0" data-duration="${seconds(duration)}"></div>
  </main>
</body>
</html>`
}

function scaledSceneWindows(duration: number) {
  const weights = [5.4, 5.6, 6.5, 6.4, 6.3, 5.8]
  const total = weights.reduce((sum, value) => sum + value, 0)
  let start = 0
  return weights.map((weight) => {
    const sceneDuration = duration * weight / total
    const result = { start, end: start + sceneDuration, duration: sceneDuration }
    start += sceneDuration
    return result
  })
}

function markSvg(className?: string) {
  return `<span${className ? ` class="${className}"` : ''}><svg viewBox="0 0 1920 1920" aria-hidden="true"><polygon points="1707.19 324.74 1473.39 602.73 1473.39 1333.64 1707.19 1613.58 1707.19 324.74"/><polygon points="442.67 202.43 218.14 202.43 196.95 202.43 131.54 202.43 202.59 279.79 409.67 527.35 409.94 527.12 724.51 903.74 773.81 962.68 773.77 962.73 920.36 1138.24 926.49 1145.27 926.52 1145.26 1406.57 1719.16 1709.86 1719.16 1620.14 1611.63 763.42 585.89 442.67 202.43"/><polygon points="1161.01 871.25 1158.32 869 1715.19 200 1691 200 1646.47 200 1416.97 200 975.2 729.1 1127.4 911.53 1161.01 871.25"/><polygon points="148.27 1716.73 453.07 1716.73 884.93 1199.29 732.73 1016.86 148.27 1716.73"/></svg></span>`
}

function normalizeHexColor(value: string | undefined, fallback: string) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim().toLowerCase() : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function seconds(value: number) {
  return Number(value.toFixed(3))
}

function escapeHtml(value: string) {
  return String(value).replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character)
  )
}
