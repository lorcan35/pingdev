import { useState } from 'react';

export function ReconPage() {
  const [url, setUrl] = useState('');

  return (
    <div className="gap-16">
      <div className="page-header">
        <h1>Recon</h1>
        <p>Automatic site analysis and action mapping (Phase 2)</p>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Site Scanner</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            placeholder="https://example.com — Enter a site URL to analyze"
            value={url}
            onChange={e => setUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" disabled>
            Scan
          </button>
        </div>
        <div className="muted text-sm" style={{ marginTop: 8 }}>
          Coming in Phase 2 — will automatically detect input fields, submit buttons,
          response containers, and generate a SiteDefinition.
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Element Discovery</div>
          <div className="empty-state" style={{ padding: 24 }}>
            <h3>Not yet implemented</h3>
            <p className="text-sm">
              Will show: detected input fields, buttons, response containers,
              overlay elements, and their CSS selectors with confidence scores.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Action Inference</div>
          <div className="empty-state" style={{ padding: 24 }}>
            <h3>Not yet implemented</h3>
            <p className="text-sm">
              Will show: inferred actions (typePrompt, submit, extractResponse, etc.)
              mapped to detected elements, with suggested SiteDefinition code.
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Generated SiteDefinition</div>
        <div className="stream-viewer" style={{ minHeight: 200, color: 'var(--text-muted)' }}>
{`// Phase 2: Auto-generated SiteDefinition will appear here
//
// import { defineSite } from '@pingdev/core';
//
// export const site = defineSite({
//   name: 'detected-site',
//   url: '${url || 'https://...'}',
//   selectors: {
//     input: { name: 'input', tiers: ['...detected...'] },
//     submit: { name: 'submit', tiers: ['...detected...'] },
//     response: { name: 'response', tiers: ['...detected...'] },
//   },
//   actions: { ... },
//   states: { ... },
//   completion: { method: 'hash_stability', pollMs: 1000, stableCount: 3, maxWaitMs: 120000 },
// });`}
        </div>
      </div>
    </div>
  );
}
