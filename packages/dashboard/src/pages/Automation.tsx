import { useCallback, useEffect, useState } from 'react';
import * as gw from '../lib/gw';
import {
  Circle,
  Play,
  Square,
  Zap,
  Film,
  Clapperboard,
  Terminal,
  Loader2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface RecordingCard extends gw.RecordingInfo {
  replaying?: boolean;
  generating?: boolean;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AutomationPage() {
  // devices
  const [devices, setDevices] = useState<gw.Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');

  // recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);

  // recordings list
  const [recordings, setRecordings] = useState<RecordingCard[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(true);

  // pipeline
  const [pipe, setPipe] = useState('');
  const [pipeRunning, setPipeRunning] = useState(false);
  const [pipeResult, setPipeResult] = useState<unknown | null>(null);
  const [pipeError, setPipeError] = useState('');

  // errors
  const [error, setError] = useState('');

  // ── Load devices ─────────────────────────────────────────────────────────

  const loadDevices = useCallback(async () => {
    try {
      const res = await gw.devices();
      const devs = res.extension?.devices ?? [];
      setDevices(devs);
      if (devs.length > 0 && !selectedDevice) {
        setSelectedDevice(devs[0].deviceId);
      }
    } catch {
      /* ignore */
    }
  }, [selectedDevice]);

  // ── Load recordings ──────────────────────────────────────────────────────

  const loadRecordings = useCallback(async () => {
    try {
      const res = await gw.listRecordings();
      setRecordings((res.recordings ?? []).map((r) => ({ ...r })));
    } catch {
      /* ignore */
    } finally {
      setLoadingRecs(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    loadRecordings();
  }, [loadDevices, loadRecordings]);

  // ── Recording controls ───────────────────────────────────────────────────

  async function handleStartRecording() {
    if (!selectedDevice) return;
    setRecordingBusy(true);
    setError('');
    try {
      await gw.startRecording(selectedDevice);
      setIsRecording(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRecordingBusy(false);
    }
  }

  async function handleStopRecording() {
    setRecordingBusy(true);
    setError('');
    try {
      await gw.stopRecording();
      setIsRecording(false);
      await loadRecordings();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRecordingBusy(false);
    }
  }

  // ── Replay / Generate ────────────────────────────────────────────────────

  async function handleReplay(rec: RecordingCard) {
    setRecordings((prev) =>
      prev.map((r) => (r.id === rec.id ? { ...r, replaying: true } : r)),
    );
    try {
      await gw.replayRecording(rec);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRecordings((prev) =>
        prev.map((r) => (r.id === rec.id ? { ...r, replaying: false } : r)),
      );
    }
  }

  async function handleGenerate(rec: RecordingCard) {
    setRecordings((prev) =>
      prev.map((r) => (r.id === rec.id ? { ...r, generating: true } : r)),
    );
    try {
      await gw.generateFromRecording(rec);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRecordings((prev) =>
        prev.map((r) => (r.id === rec.id ? { ...r, generating: false } : r)),
      );
    }
  }

  // ── Pipeline ─────────────────────────────────────────────────────────────

  async function handleRunPipe() {
    if (!pipe.trim()) return;
    setPipeRunning(true);
    setPipeResult(null);
    setPipeError('');
    try {
      const res = await gw.runPipe(pipe.trim());
      setPipeResult(res);
    } catch (e: any) {
      setPipeError(e.message);
    } finally {
      setPipeRunning(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-fg flex items-center gap-2">
          <Clapperboard className="w-6 h-6 text-accent-cyan" />
          Automation Workshop
        </h1>
        <p className="text-muted text-sm mt-1">
          Record browser actions, replay them, and chain pipes.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-health-offline/30 bg-health-offline/10 px-4 py-3 text-sm text-health-offline">
          {error}
          <button
            className="ml-3 underline opacity-70 hover:opacity-100"
            onClick={() => setError('')}
          >
            dismiss
          </button>
        </div>
      )}

      {/* ── Recording Section ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-fg flex items-center gap-2">
            <Circle className={`w-4 h-4 ${isRecording ? 'text-health-offline animate-pulse' : 'text-muted'}`} />
            Recording
          </h2>
          {isRecording && (
            <span className="text-xs font-mono text-health-offline animate-pulse">
              REC
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          {/* Device selector */}
          <label className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
            <span className="text-xs text-muted uppercase tracking-wider">
              Target Device
            </span>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg focus:outline-none focus:border-accent-cyan"
            >
              {devices.length === 0 && (
                <option value="">No devices</option>
              )}
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.title || d.url || d.deviceId}
                </option>
              ))}
            </select>
          </label>

          {/* Buttons */}
          <div className="flex gap-2">
            <button
              disabled={isRecording || recordingBusy || !selectedDevice}
              onClick={handleStartRecording}
              className="flex items-center gap-2 rounded-lg bg-accent-green/15 border border-accent-green/30 px-4 py-2 text-sm font-medium text-accent-green hover:bg-accent-green/25 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {recordingBusy && !isRecording ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start Recording
            </button>
            <button
              disabled={!isRecording || recordingBusy}
              onClick={handleStopRecording}
              className="flex items-center gap-2 rounded-lg bg-health-offline/15 border border-health-offline/30 px-4 py-2 text-sm font-medium text-health-offline hover:bg-health-offline/25 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {recordingBusy && isRecording ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              Stop Recording
            </button>
          </div>
        </div>
      </section>

      {/* ── Recordings List ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-fg flex items-center gap-2">
            <Film className="w-5 h-5 text-accent-cyan" />
            Recordings
          </h2>
          <button
            onClick={loadRecordings}
            className="text-xs text-muted hover:text-fg transition"
          >
            refresh
          </button>
        </div>

        {loadingRecs ? (
          <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading recordings...
          </div>
        ) : recordings.length === 0 ? (
          <div className="text-sm text-dim py-6 text-center">
            No recordings yet. Start one above.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recordings.map((rec) => (
              <div
                key={rec.id}
                className="rounded-lg border border-border bg-bg p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-mono text-fg truncate">
                      {rec.id}
                    </p>
                    <p className="text-xs text-muted truncate mt-0.5">
                      {rec.url}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-dim">
                  <span>{rec.actionCount} actions</span>
                  <span>
                    {new Date(rec.startedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleReplay(rec)}
                    disabled={rec.replaying}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-accent-cyan/15 border border-accent-cyan/25 px-3 py-1.5 text-xs font-medium text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-50 transition"
                  >
                    {rec.replaying ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    Replay
                  </button>
                  <button
                    onClick={() => handleGenerate(rec)}
                    disabled={rec.generating}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-md bg-accent-green/15 border border-accent-green/25 px-3 py-1.5 text-xs font-medium text-accent-green hover:bg-accent-green/25 disabled:opacity-50 transition"
                  >
                    {rec.generating ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Zap className="w-3 h-3" />
                    )}
                    Generate PingApp
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Pipeline Section ──────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-lg font-medium text-fg flex items-center gap-2">
          <Terminal className="w-5 h-5 text-accent-cyan" />
          Pipeline
        </h2>
        <p className="text-xs text-muted">
          Pipe shorthand — e.g.{' '}
          <code className="bg-bg px-1.5 py-0.5 rounded text-accent-cyan">
            tab1:extract | tab2:type
          </code>
        </p>

        <textarea
          value={pipe}
          onChange={(e) => setPipe(e.target.value)}
          rows={3}
          placeholder="tab1:extract | tab2:type"
          className="w-full rounded-lg border border-border bg-bg px-4 py-3 text-sm font-mono text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan resize-y"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleRunPipe}
            disabled={pipeRunning || !pipe.trim()}
            className="flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/30 px-5 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {pipeRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Run
          </button>
          {pipeRunning && (
            <span className="text-xs text-muted">Executing pipeline...</span>
          )}
        </div>

        {pipeError && (
          <div className="rounded-lg border border-health-offline/30 bg-health-offline/10 px-4 py-3 text-sm text-health-offline font-mono">
            {pipeError}
          </div>
        )}

        {pipeResult !== null && !pipeError && (
          <div className="rounded-lg border border-border bg-bg p-4 overflow-auto max-h-80">
            <pre className="text-xs font-mono text-fg whitespace-pre-wrap">
              {typeof pipeResult === 'string'
                ? pipeResult
                : JSON.stringify(pipeResult, null, 2)}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
}
