import { Download, Share2, Zap } from 'lucide-react';

const steps = [
  {
    num: 1,
    icon: Download,
    title: 'Install Extension',
    desc: (
      <>
        Open <span className="font-mono text-accent-cyan">chrome://extensions</span> &rarr; enable{' '}
        <span className="text-fg">Developer Mode</span> &rarr; Load Unpacked &rarr;{' '}
        <span className="font-mono text-accent-cyan">packages/chrome-extension/dist</span>
      </>
    ),
  },
  {
    num: 2,
    icon: Share2,
    title: 'Share a Tab',
    desc: 'Click the PingOS extension icon in the toolbar, then toggle sharing for the current tab.',
  },
  {
    num: 3,
    icon: Zap,
    title: 'Try an Extract',
    desc: 'Use the extract box below to pull structured data from any shared tab using natural language.',
  },
] as const;

export function GettingStarted() {
  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-fg">Getting Started</h2>
        <p className="mt-0.5 text-xs text-muted">Three steps to your first extract</p>
      </div>

      <div className="grid gap-0 divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
        {steps.map((step) => (
          <div key={step.num} className="flex gap-3.5 px-5 py-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-accent-green/30 bg-accent-green/10 text-accent-green">
              <step.icon size={15} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-border text-[10px] font-bold text-muted">
                  {step.num}
                </span>
                <span className="text-sm font-medium text-fg">{step.title}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
