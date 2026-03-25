import { useCallback, useEffect, useState } from 'react';
import * as gw from '../lib/gw';
import {
  Shield,
  CheckCircle2,
  XCircle,
  Loader2,
  LogIn,
  Zap,
  RefreshCw,
  X,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface DeviceAuth {
  device: gw.Device;
  checking: boolean;
  result: gw.AuthCheckResult | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export function AuthCenterPage() {
  const [deviceAuths, setDeviceAuths] = useState<DeviceAuth[]>([]);
  const [loading, setLoading] = useState(true);

  // Google Sign In form
  const [signInDevice, setSignInDevice] = useState('');
  const [signInEmail, setSignInEmail] = useState('');
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInResult, setSignInResult] = useState<gw.AuthResult | null>(null);

  // Auto Auth form
  const [autoDomain, setAutoDomain] = useState('');
  const [autoEmail, setAutoEmail] = useState('');
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoResult, setAutoResult] = useState<gw.AuthResult | null>(null);

  // error
  const [error, setError] = useState('');

  // ── Load devices + check auth ────────────────────────────────────────────

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await gw.devices();
      const devs = res.extension?.devices ?? [];
      const entries: DeviceAuth[] = devs.map((d) => ({
        device: d,
        checking: true,
        result: null,
      }));
      setDeviceAuths(entries);

      if (devs.length > 0 && !signInDevice) {
        setSignInDevice(devs[0].deviceId);
      }

      // check auth for each device
      for (const entry of entries) {
        try {
          const check = await gw.googleAuthCheck(entry.device.deviceId);
          setDeviceAuths((prev) =>
            prev.map((da) =>
              da.device.deviceId === entry.device.deviceId
                ? { ...da, checking: false, result: check }
                : da,
            ),
          );
        } catch {
          setDeviceAuths((prev) =>
            prev.map((da) =>
              da.device.deviceId === entry.device.deviceId
                ? { ...da, checking: false }
                : da,
            ),
          );
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [signInDevice]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  // ── Google Sign In ───────────────────────────────────────────────────────

  async function handleSignIn() {
    if (!signInDevice) return;
    setSignInBusy(true);
    setSignInResult(null);
    setError('');
    try {
      const res = await gw.googleAuth(
        signInDevice,
        signInEmail.trim() || undefined,
      );
      setSignInResult(res);
      // refresh auth statuses
      loadDevices();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSignInBusy(false);
    }
  }

  // ── Auto Auth ────────────────────────────────────────────────────────────

  async function handleAutoAuth() {
    if (!autoDomain.trim()) return;
    setAutoBusy(true);
    setAutoResult(null);
    setError('');
    try {
      const res = await gw.googleAuthAuto(
        autoDomain.trim(),
        autoEmail.trim() || undefined,
      );
      setAutoResult(res);
      loadDevices();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAutoBusy(false);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  const devices = deviceAuths.map((da) => da.device);

  function renderAuthResult(result: gw.AuthResult) {
    return (
      <div className="rounded-lg border border-border bg-bg p-4 space-y-2 text-sm">
        <div className="flex items-center gap-2">
          {result.ok ? (
            <CheckCircle2 className="w-4 h-4 text-accent-green" />
          ) : (
            <XCircle className="w-4 h-4 text-health-offline" />
          )}
          <span className={result.ok ? 'text-accent-green' : 'text-health-offline'}>
            {result.ok ? 'Authentication Successful' : 'Authentication Failed'}
          </span>
        </div>
        {result.alreadyAuthenticated && (
          <p className="text-muted text-xs">Already authenticated</p>
        )}
        {result.selectedEmail && (
          <p className="text-xs">
            <span className="text-muted">Email:</span>{' '}
            <span className="text-fg font-mono">{result.selectedEmail}</span>
          </p>
        )}
        {result.finalUrl && (
          <p className="text-xs truncate">
            <span className="text-muted">Final URL:</span>{' '}
            <span className="text-fg font-mono">{result.finalUrl}</span>
          </p>
        )}
        {result.detail && (
          <p className="text-xs text-muted">{result.detail}</p>
        )}
        {result.error && (
          <p className="text-xs text-health-offline">{result.error}</p>
        )}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-fg flex items-center gap-2">
            <Shield className="w-6 h-6 text-accent-cyan" />
            Auth Center
          </h1>
          <p className="text-muted text-sm mt-1">
            Manage Google authentication across browser devices.
          </p>
        </div>
        <button
          onClick={loadDevices}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted hover:text-fg transition"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-health-offline/30 bg-health-offline/10 px-4 py-3 text-sm text-health-offline flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Device Auth Status ────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-lg font-medium text-fg">Device Auth Status</h2>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted py-6 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking devices...
          </div>
        ) : deviceAuths.length === 0 ? (
          <div className="text-sm text-dim py-6 text-center">
            No devices connected.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deviceAuths.map((da) => (
              <div
                key={da.device.deviceId}
                className="rounded-lg border border-border bg-bg p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-mono text-fg truncate">
                      {da.device.title || da.device.deviceId}
                    </p>
                    <p className="text-xs text-muted truncate mt-0.5">
                      {da.device.url}
                    </p>
                  </div>
                  <div className="shrink-0 ml-2">
                    {da.checking ? (
                      <Loader2 className="w-5 h-5 text-muted animate-spin" />
                    ) : da.result?.authenticated ? (
                      <CheckCircle2 className="w-5 h-5 text-accent-green" />
                    ) : (
                      <XCircle className="w-5 h-5 text-health-offline" />
                    )}
                  </div>
                </div>
                {!da.checking && da.result && (
                  <div className="text-xs">
                    {da.result.authenticated ? (
                      <span className="text-accent-green">
                        Authenticated
                        {da.result.email && ` as ${da.result.email}`}
                      </span>
                    ) : (
                      <span className="text-health-offline">Not authenticated</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Google Sign In ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-lg font-medium text-fg flex items-center gap-2">
          <LogIn className="w-5 h-5 text-accent-cyan" />
          Google Sign In
        </h2>
        <p className="text-xs text-muted">
          Authenticate a specific device with a Google account.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted uppercase tracking-wider">
              Device
            </span>
            <select
              value={signInDevice}
              onChange={(e) => setSignInDevice(e.target.value)}
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

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted uppercase tracking-wider">
              Email (optional)
            </span>
            <input
              type="email"
              value={signInEmail}
              onChange={(e) => setSignInEmail(e.target.value)}
              placeholder="user@gmail.com"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan"
            />
          </label>
        </div>

        <button
          onClick={handleSignIn}
          disabled={signInBusy || !signInDevice}
          className="flex items-center gap-2 rounded-lg bg-accent-cyan/15 border border-accent-cyan/30 px-5 py-2 text-sm font-medium text-accent-cyan hover:bg-accent-cyan/25 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {signInBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <LogIn className="w-4 h-4" />
          )}
          Authenticate
        </button>

        {signInResult && renderAuthResult(signInResult)}
      </section>

      {/* ── Auto Auth ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-6 space-y-4">
        <h2 className="text-lg font-medium text-fg flex items-center gap-2">
          <Zap className="w-5 h-5 text-health-degraded" />
          Auto Auth
        </h2>
        <p className="text-xs text-muted">
          Automatically authenticate on a domain using Google SSO.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted uppercase tracking-wider">
              Domain
            </span>
            <input
              value={autoDomain}
              onChange={(e) => setAutoDomain(e.target.value)}
              placeholder="accounts.google.com"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted uppercase tracking-wider">
              Email (optional)
            </span>
            <input
              type="email"
              value={autoEmail}
              onChange={(e) => setAutoEmail(e.target.value)}
              placeholder="user@gmail.com"
              className="rounded-lg border border-border bg-bg px-3 py-2 text-sm text-fg placeholder:text-dim focus:outline-none focus:border-accent-cyan"
            />
          </label>
        </div>

        <button
          onClick={handleAutoAuth}
          disabled={autoBusy || !autoDomain.trim()}
          className="flex items-center gap-2 rounded-lg bg-health-degraded/15 border border-health-degraded/30 px-5 py-2 text-sm font-medium text-health-degraded hover:bg-health-degraded/25 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {autoBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          Auto Authenticate
        </button>

        {autoResult && renderAuthResult(autoResult)}
      </section>
    </div>
  );
}
