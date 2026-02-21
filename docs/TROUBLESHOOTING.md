# Troubleshooting PingOS

If you run into issues, follow this guide to identify and fix the most common problems.

## 🛠️ The Ultimate Fix-All Command

Whenever things go wrong, your first step should be to run the built-in diagnostic tool:

```bash
pingos doctor
```

This command will check your Node.js version, gateway status, port availability, Chrome installation, and extension connectivity. It will explicitly tell you **what failed** and **how to fix it**.

---

## Common Issues & Fixes

### 1. "Port 3500 is in use"
**Symptom:** Running `pingos up` fails because the port is already bound.
**Fix:**
Another PingOS instance or a different app is using port 3500. Run:
```bash
pingos down
```
If that doesn't work, manually kill the process:
```bash
lsof -ti :3500 | xargs kill -9
```

### 2. "No tabs connected yet"
**Symptom:** You run `pingos demo` or an API call, but get an error that no devices are connected.
**Fix:**
1. Make sure you opened the browser using `pingos up`.
2. Ensure you navigated to a standard website (not a `chrome://` page).
3. **Crucial:** Click the PingOS extension icon and make sure the toggle next to your tab is green (Connected). 

### 3. "Extract failed: Could not connect to gateway"
**Symptom:** CLI operations instantly fail with connection errors.
**Fix:**
The gateway isn't running in the background. Start it:
```bash
pingos up --daemon
```

### 4. "Extension dist not found"
**Symptom:** `pingos doctor` complains about the extension build missing.
**Fix:**
You need to compile the Chrome extension before running the gateway.
```bash
cd packages/chrome-extension
npm run build
```

### 5. Selectors keep breaking!
**Symptom:** A site changed its layout, and your `pingapp.json` selectors no longer work.
**Fix:**
Run the PingApp with self-healing enabled:
```bash
pingos serve ./pingapp --self-heal
```
Or manually heal the app:
```bash
pingos heal ./pingapp
```

---

Still stuck? Check the [logs in `~/.pingos/gateway.log`](~/.pingos/gateway.log) or open an issue on GitHub!
