# PingOS Tutorials

Ready to see what PingOS can do? Here are three real-world walkthroughs showing how to use PingOS to automate the web without writing brittle scraping scripts.

---

## Tutorial 1: Extract Hacker News Top Stories

**Goal:** Turn Hacker News into a structured JSON API in 3 steps.

1. **Start PingOS:**
   Ensure your gateway and browser are running:
   ```bash
   pingos up
   ```
2. **Connect the Tab:**
   Navigate to `https://news.ycombinator.com` in the opened Chrome window. Click the PingOS extension icon and toggle the switch to connect the tab.
3. **Run Smart Discovery & Extract:**
   You don't need to specify CSS selectors. Just ask PingOS to discover and extract:
   ```bash
   pingos demo
   ```
   *PingOS will intelligently figure out the structure of Hacker News and give you a JSON array of the top stories, authors, and points.*

**Pro-Tip:** Want to save this as a permanent API?
```bash
pingos init https://news.ycombinator.com
# Follow the wizard to generate a persistent "PingApp" wrapper!
```

---

## Tutorial 2: Monitor a Product Price on Amazon

**Goal:** Keep an eye on a specific item's price without manually checking.

1. **Connect Amazon:**
   Open a specific Amazon product page in the managed Chrome browser. Open the PingOS extension and connect the tab.
2. **Find the Device ID:**
   ```bash
   pingos status
   ```
   *(Note your device ID, e.g., `chrome-123`)*
3. **Start Watching the Price:**
   We can tell PingOS to watch a specific selector (or let it auto-discover).
   ```bash
   pingos watch chrome-123 --schema '{"price": ".a-price-whole"}' --interval 10000
   ```
   *PingOS will now stream price changes to your terminal every 10 seconds!*

---

## Tutorial 3: Automate a Form Submission

**Goal:** Fill out a contact form or search input automatically using the API.

1. **Connect the Site:**
   Open the target site (e.g., a dummy contact form or search engine) and connect the tab via the extension.
2. **Use the `type` and `click` Commands:**
   Instead of writing a complex Playwright script, simply issue REST calls or CLI commands to interact:
   ```bash
   # Type into the search box
   pingos type chrome-123 "Best mechanical keyboards" --selector "input[name='q']"
   
   # Click the search button
   pingos click chrome-123 "button[type='submit']"
   ```
3. **Advanced: The `act` Command**
   Don't know the selectors? Use the `act` command and let PingOS figure it out!
   ```bash
   pingos act chrome-123 "Type 'Best mechanical keyboards' into the search bar and press Enter"
   ```

---

**Next Steps:**
- Explore the [API Reference](API-REFERENCE.md) to integrate these calls directly into your Node.js or Python backend.
- If you run into issues, check [Troubleshooting](TROUBLESHOOTING.md).
