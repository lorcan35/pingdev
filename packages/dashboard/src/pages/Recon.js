import { useMemo, useState } from 'react';
export function ReconPage() {
    const [url, setUrl] = useState('');
    const [step, setStep] = useState('URL');
    const canAdvance = useMemo(() => url.trim().startsWith('http'), [url]);
    return (<div className="page">
      <div className="hero">
        <div className="hero-main">
          <div className="h1">Recon</div>
          <div className="hsub">Turn a site into a PingApp definition. Live wizard UI (backend wiring in Phase 2).</div>
        </div>
      </div>

      <div className="recon">
        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Target</div>
            <div className="panel-sub">Paste a URL, then walk the pipeline.</div>
          </div>

          <div className="recon-row">
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com"/>
            <button className="btn primary" disabled={!canAdvance} onClick={() => setStep('SNAPSHOT')}>
              Start
            </button>
          </div>

          <div className="callout">
            <div className="mono dim">Status</div>
            <div className="mono">
              {canAdvance ? 'Ready to snapshot.' : 'Enter a valid URL to begin.'}
            </div>
          </div>
        </div>

        <div className="panel">
            <div className="panel-head">
              <div className="panel-title">Pipeline</div>
              <div className="panel-sub">Snapshot -&gt; Analyze -&gt; Generate -&gt; Deploy</div>
            </div>

          <div className="steps">
            {['URL', 'SNAPSHOT', 'ANALYZE', 'GENERATE', 'DEPLOY'].map(s => (<button key={s} className={`step ${step === s ? 'on' : ''} ${isBefore(step, s) ? 'locked' : ''}`} disabled={s !== 'URL' && !canAdvance} onClick={() => setStep(s)}>
                <div className="step-title">{s}</div>
                <div className="step-sub">
                  {s === 'URL' && 'Set target'}
                  {s === 'SNAPSHOT' && 'Capture DOM + screenshot'}
                  {s === 'ANALYZE' && 'Infer selectors + actions'}
                  {s === 'GENERATE' && 'Emit SiteDefinition'}
                  {s === 'DEPLOY' && 'Register new port'}
                </div>
              </button>))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div className="panel-title">Generated Definition</div>
            <div className="panel-sub">Preview of what Phase 2 will stream here.</div>
          </div>

          <div className="codebox">
            <pre>{renderStub(url)}</pre>
          </div>
        </div>
      </div>
    </div>);
}
function isBefore(cur, candidate) {
    const order = ['URL', 'SNAPSHOT', 'ANALYZE', 'GENERATE', 'DEPLOY'];
    return order.indexOf(cur) < order.indexOf(candidate);
}
function renderStub(url) {
    const u = url.trim() || 'https://…';
    return `// Phase 2: Recon engine will stream structured output here.
//
// import { defineSite } from '@pingdev/core';
//
// export const site = defineSite({
//   name: 'detected-site',
//   url: '${u}',
//   selectors: {
//     input: { name: 'input', tiers: ['...detected...'] },
//     submit: { name: 'submit', tiers: ['...detected...'] },
//     response: { name: 'response', tiers: ['...detected...'] },
//   },
//   actions: { /* inferred */ },
//   states: { transitions: { IDLE: ['TYPING'], TYPING: ['GENERATING'] } },
//   completion: { method: 'hash_stability', pollMs: 1000, stableCount: 3, maxWaitMs: 120000 },
// });`;
}
//# sourceMappingURL=Recon.js.map