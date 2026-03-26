# Gemini UI Element Registry (gemini.google.com)

> Last mapped: 2026-02-12 20:05 (Asia/Dubai)
> Account: emilesawayame@gmail.com (Emile Sawaya)
> Browser: openclaw profile, targetId: 0B2BA2B5A48BC8EC9F8DB69667CD17AF
> Model shown: Gemini 3 (ULTRA tier)

---

## 🎯 Core Chat Controls

| Element | Ref | Selector/Label | Notes |
|---------|-----|----------------|-------|
| **Chat input** | `e92` / `e245` (sidebar open) | `textbox "Enter a prompt for Gemini"` | Active by default. Placeholder: "Ask Gemini 3" |
| **Send button** | (text node "send" near e127) | Text "send" after mic button | Appears as text, may need evaluate-based click or Enter key |
| **Microphone** | `e125` / `e249` | `button "Microphone"` / img "mic" | Voice input |
| **Upload file** | `e99` / `e246` | `button "Open upload file menu"` / img "add_2" | Opens file attachment menu |
| **Tools** | `e106` / `e247` | `button "Tools"` / img "page_info" | Opens tools panel |
| **Mode picker** | `e115` / `e248` | `button "Open mode picker"` / img "keyboard_arrow_down" | Selects between modes (needs click to reveal options) |

## 📋 Top Bar / Navigation

| Element | Ref | Selector/Label | Notes |
|---------|-----|----------------|-------|
| **Main menu (hamburger)** | `e20` | `button "Main menu"` / img "menu" | Toggles sidebar |
| **New chat** | `e25` | `link "New chat"` → /app | Top bar shortcut |
| **Account button** | `e8` | `button "Google Account: Emile Sawaya (emilesawayame@gmail.com)"` | Profile/account menu |
| **Model badge** | (disabled button) | `button "ULTRA"` [disabled] | Shows current tier, not clickable |

## 📂 Sidebar (visible after clicking Main menu e20)

| Element | Ref | Selector/Label | Notes |
|---------|-----|----------------|-------|
| **Close menu** | `e137` | `button "Close menu"` | Closes sidebar |
| **Search chats** | `e140` | `button "Search for chats"` / img "search" | Search history |
| **New chat (sidebar)** | `e148` | `link "New chat"` → /app / img "edit_square" | Same as top bar |
| **Temporary chat** | `e153` | `button "Temporary chat"` | Ephemeral conversation mode |
| **My stuff** | `e162` | `link "My stuff"` → /mystuff / img "family_star" | Saved items |
| **Gems** | `e170` | `link "Gems"` → /gems/view | Custom Gems |
| **Settings & help** | `e233` | `button "Settings & help"` / img "settings_2" | Settings panel |
| **Chat history section** | `e178` | `heading "Chats"` | Container for past conversations |

### Chat History Items (region e179)
Past conversations as buttons — clickable to resume:
- `e181`: "Casual Greeting And Offer"
- `e185`: "SMS Gateway Hardware Solutions"
- `e189`: (unnamed)
- `e193`: "Automating SMS with GSM Modem Pool"
- `e197`: "Casual Conversation"
- `e201`: "Practicing Self-Love: A Guide"
- `e205`: "Ready to Help You Today"
- `e209`: "Change the number on top to 6,885.94"
- `e213`: "18650 Batteries Powering Mechanical Arm"
- `e217`: "18650 Batteries For Robotic Arm"
- `e221`: "Digital Courseware and Simulation Access"
- `e225`: "Change amount due..."
- `e229`: "إشعار انقطاع خدمة المياه"

## 🎨 Quick Action Buttons (Home Screen)

| Element | Ref | Label | Notes |
|---------|-----|-------|-------|
| Create image | `e69` | "🍌 Create image, button, tap to use tool" | Shortcut |
| Write anything | `e72` | "Write anything, button, tap to use tool" | Shortcut |
| Create video | `e75` | "Create video, button, tap to use tool" | Shortcut |
| Help me learn | `e78` | "Help me learn, button, tap to use tool" | Shortcut |
| Boost my day | `e81` | "Boost my day, button, tap to use tool" | Shortcut |

## 🔧 Shim Automation Notes

### Sending a message (recommended flow):
1. Click chat input (`e92`)
2. Type message via `act:type` on `e92`
3. Press Enter (`act:press`, key "Enter") — OR find/click the send element
4. Wait for response — re-snapshot and look for new content after the greeting headings

### Starting a new chat:
1. Click `e25` (New chat link) or navigate to /app

### Switching conversations:
1. Open sidebar (`e20`)
2. Click a chat history button (e181, e185, etc.)

### Opening mode picker:
1. Click `e115` — will reveal dropdown with model/mode options
2. Re-snapshot to capture available modes

### Key stability concerns:
- ARIA refs (`eNN`) change on page reload — use role+label selectors as fallback
- Stable selectors: `textbox "Enter a prompt for Gemini"`, `button "Main menu"`, `link "New chat"`, `button "Microphone"`
- The "send" control is a text node, not a proper button — may need `press Enter` instead of clicking

### Response detection:
- After sending, new content appears below the greeting headings
- Look for new heading/paragraph elements or role="article" containers
- Response streaming means multiple snapshots may be needed to get full response

---

## 🧠 Mode Picker (observed previously)

Triggered by: **button "Open mode picker"** (down-arrow next to input).

When opened, a **dialog** appears containing **menuitemradio** options:
- **Fast** — "Fast Answers quickly" (menuitemradio)
- **Thinking** — "Thinking Solves complex problems" (menuitemradio)
- **Pro** — "Pro Thinks longer for advanced math & code" (menuitemradio, checked)

---

## 🧰 Tools Menu (toggles) — 2026-02-12 20:14 (Asia/Dubai)

Triggered by: `button "Tools"` (ref `e106`, `[expanded]` when open).

Observed menu items (role: `menuitemcheckbox`):
- `menuitemcheckbox "Deep Research"` (ref `e139`)
- `menuitemcheckbox "Create videos (Veo 3.1)"` (ref `e147`)
- `menuitemcheckbox "Create images"` (ref `e155`)
- `menuitemcheckbox "Canvas"` (ref `e162`)
- `menuitemcheckbox "Guided Learning"` (ref `e170`)
- `menuitemcheckbox "Deep Think"` (ref `e178`)

Screenshot (menu open):
- `/home/rebelforce/.openclaw/workspace/memory/gemini-tools-menu.png`

State detection TBD (next step: click each item and confirm `[checked]` aria state + any UI mode change).

---

## ➕ Upload File Menu ("Open upload file menu" / + add_2) — observed previously

Triggered by:
- Collapsed: `button "Open upload file menu"` (e.g., ref `e99`)
- Expanded: `button "Close upload file menu"` (appears when menu open, `[expanded]`)

Menu container:
- Role/name: `menu "Upload file options"` (`[role='menu'][aria-label='Upload file options']`)

Menu items (top → bottom) observed:

| Visual label | Role/name (aria) | Notes |
|---|---|---|
| **Upload files** | `menuitem "Upload files. Documents, data, code files"` | Row includes an **info** icon (may be separate click target). |
| **Add from Drive** | `menuitem "Add from Drive. Sheets, Docs, Slides"` | Opens Drive picker flow. |
| **Photos** | `menuitem "Google Photos"` | Visual label shows as "Photos" but aria label is "Google Photos". |
| **Import code** | `menuitem "Import code"` | Opens import flow. |
| **NotebookLM** | `menuitem "NotebookLM"` | Opens NotebookLM attachment flow. |

Screenshot (older run):
- `/home/rebelforce/.openclaw/workspace/memory/gemini-ui-upload-menu.png`

NOTE: A fresh run screenshot will be saved as:
- `/home/rebelforce/.openclaw/workspace/memory/gemini-upload-menu.png`

---

## ➕ Upload (+) Menu — items + workflow

When open:
- **Menu container:** `menu "Upload file options"` ref `e395`
- **Toggle button:** `button "Close upload file menu"` (expanded) ref `e387` (icon `add_2`)
  - When closed, this button label flips back to "Open upload file menu".

### Menu items (menuitem)
- `e397` — **Upload files. Documents, data, code files** (icon `attach_file`, has an info icon `e405`)
- `e407` — **Add from Drive. Sheets, Docs, Slides** (icon `drive`)
- `e416` — **Google Photos** (icon `photos`)
- `e421` — **Import code** (icon `code`)
- `e426` — **NotebookLM**

### Workflow recipe (shim)
1) Click upload button (ref `e387` when open / same physical button when closed)
2) In the menu `e395`, click the desired source (e397/e407/e416/e421/e426)
3) A picker/dialog should appear (depends on item). After selection, look for an **attachment chip/preview** near the input before sending.
4) Send message (prefer **Enter key** rather than clicking the "send" text).

### State detection
- Upload menu open when a `menu` with name **"Upload file options"** is present (ref like `e395`).
- Button shows `[expanded]` when menu is open.


---

## 🧰 Tools toggles — workflows + state detection

**Open Tools menu:** click `button "Tools"` (ref `e329`).

When open, these appear as `menuitemcheckbox` entries:
- Deep Research: `e450`
- Create videos (Veo 3.1): `e458`
- Create images: `e466`
- Canvas: `e473`
- Guided Learning: `e481`
- Deep Think: `e489`

### State detection (critical for shim)
In snapshot output, each toggle is a `menuitemcheckbox`.
- When enabled, it should expose a checked/selected state (varies by render; sometimes shows `[checked]` or an inner check icon).
- Reliable approach: after clicking a toggle, immediately re-snapshot and compare the node attributes/text for that menuitemcheckbox.

### Workflow pattern (generic)
1) Ensure clean state: press **Escape** to close any menu/dialog.
2) Open Tools (`e329`).
3) Click the toggle (e450/e458/e466/e473/e481/e489).
4) Re-snapshot to confirm checked state changed.
5) Close Tools (Escape).
6) Send a deterministic probe prompt to validate behavior.

### Per-toggle notes (needs probe)
At this stage we have the menuitem refs and the open/close mechanics. Next step is to toggle each ON one-by-one and capture what UI changes (chips, new buttons, response formatting) + a probe prompt per toggle.


### Deep Research — observed workflow + UI changes

After toggling **Deep Research** ON:
- The prompt placeholder changes to: **"What do you want to research?"**
- A new chip/button appears in the input row:
  - `button "Deselect Deep Research"` ref `e501` (icon `travel_explore` + close `x`)
- A new control appears:
  - `button "Sources, Google Search selected"` ref `e511` (dropdown)
- Another new button appears near the input:
  - `button` ref `e522` (shows an `upload` icon `e526`) — likely deep-research source upload

**Input textbox changed:** now `textbox` ref `e499` (was `e327`).

**Shim workflow (Deep Research):**
1) Open Tools → click **Deep Research**.
2) Confirm active by detecting `button "Deselect Deep Research"` near the input.
3) Optionally open Sources dropdown (`e511`) to choose sources.
4) Type into textbox (`e499`).
5) Press Enter to send.

**Deterministic test prompt suggestion:**
"Reply exactly with: DEEP_RESEARCH_ACTIVE | UI_TEST_OK"


#### Deep Research — response rendering / streaming indicators

After submitting the test prompt, Gemini enters a research flow:
- User message container:
  - `heading` level=5 `e555` includes: "You said Reply exactly with: ..." (text in paragraph `e557`)
  - User actions: `button "Copy prompt"` ref `e548`, `button "Show more options"` ref `e570`
- Gemini response header:
  - `heading "Gemini said"` level=6 ref `e589`
- Streaming/status indicator:
  - `status "Generating research plan"` ref `e584`
  - Expand/collapse arrow: `img expand_more` ref `e586` (inside a button `e581`)
- While generating, the usual send icon becomes:
  - `button "Stop response"` ref `e594` with stop icon `e596`

**Shim scrape strategy (Deep Research):**
- Watch for a `status` node like `e584` to determine in-progress.
- Final answer text will appear under the "Gemini said" block; snapshot repeatedly until `status` disappears.


#### Deep Research — plan screen (post-generation)

After the "Generating research plan" phase completes, Gemini shows a **plan card** with explicit CTAs:
- The prior `status` becomes: `status "Show thinking"` ref `e584` (suggests collapsible reasoning panel)
- Plan completion text: paragraph `e612`: "I've put together a research plan..."
- CTA buttons on the plan card:
  - `button "Edit the research plan"` ref `e638`
  - `button "Start research"` ref `e642`
  - `button "Try again without Deep Research"` ref `e647`

**Shim workflow (Deep Research end-to-end):**
1) Enable Deep Research (confirm chip `e501`).
2) Submit prompt.
3) Poll snapshots until the in-progress status changes away from "Generating research plan".
4) Detect plan card CTAs (e638/e642). If present, you are in the **plan gate** state.
5) Click `Start research` (e642) to proceed to the actual research/results phase.


#### Deep Research — entering research phase

After clicking **Start research**, Gemini appends a new user message:
- `heading "You said Start research"` level=5 ref `e702` (text `e704`)

And it begins generating again (send button becomes Stop):
- `button "Stop response"` ref `e594` (stop icon `e722`)

Note: The original plan card's Start button ref can change after navigation (we clicked `e642` earlier; now the plan card shows `button "Start research"` ref `e680`). Prefer selecting by role+name.


---

## ❌ Deep Research — failure state: "Research unsuccessful"

When a Deep Research run fails, a left-side panel shows the failure marker:
- Panel container: `generic e724`
- Failure text: `generic e748` **"Research unsuccessful"**
- Panel controls:
  - `button "Close panel"` ref `e728`
  - `button "Create"` ref `e735` (dropdown)

This failure state can appear even while the main chat still shows the plan card / prior messages.

**Shim recovery workflow:**
1) Detect failure by presence of text node "Research unsuccessful" (e748) in the panel area.
2) Close the panel (e728) to return focus to the main prompt.
3) Retry Deep Research with a *real research query* (not an instruction-only probe), OR open Sources dropdown (e511 when DR is active) to change sources, then resubmit.
4) If repeated failures: disable Deep Research via `button "Deselect Deep Research"` (e501) and retry without DR.

---

## 🎬 Create Videos (Veo 3.1) — Tool Mapping (ULTRA Account 2026-02-13)

### Activation
- **Toggle:** `menuitemcheckbox "Create videos (Veo 3.1)"` in Tools menu (icon: `movie`)
- **Available in:** Fast mode (confirmed), Thinking mode, Pro mode

### UI Changes When Active
1. **Placeholder text changes:** "Ask Gemini 3" → **"Describe your video"**
2. **Active tool chip:** `button "Deselect Video"` appears near input (icon: `movie` + close `x`)
3. **No layout split** — stays in standard single-column chat layout
4. **Quick action buttons** remain unchanged
5. **Mode picker** remains accessible

### Deactivation
- Click `button "Deselect Video"` chip to disable

### Response Flow (Video Generation)
1. **Immediate acknowledgment:** "I'm generating your video. This could take a few minutes, so check back to see when your video is ready."
2. **Generation card:** Gray card appears: "Generating your video... This can take **2–3 mins**" (ULTRA-specific: 2-3 mins vs PRO 1-2 mins)
3. **Stop button:** `button "Stop response"` (blue square icon) replaces Microphone during generation
4. **Chat auto-titled:** Conversation gets auto-generated title (e.g., "Cat Playing With Yarn Video")
5. **Show thinking toggle:** Button with `expand_more` icon appears — **ULTRA exclusive** (PRO doesn't have this on video responses)

### Video Result Rendering (ULTRA Account)
- **Completion text:** "Your video is ready!"
- **Video player card:** Large inline video with play button overlay
- **Player controls (overlay on video):**
  - `button "Share video"` (icon: `share`) — **ULTRA: appears on player**
  - `button "Download video"` (icon: `download`) — downloads generated video
  - `button "Play video"` / `button "Pause video"` (icon: `play_arrow` / `pause`) — toggles playback
  - `button "Mute video"` (icon: `volume_up`) — toggles audio
  - `slider "Seek slider"` — scrub timeline (value shows playback position)
- **Feedback buttons (below video):**
  - `button "Good response"` (thumbs up)
  - `button "Bad response"` (thumbs down)
  - `button "Redo"` (icon: `refresh`) — regenerate video
  - `button "Share video"` (icon: `share`) — **ULTRA: appears TWICE** (player + feedback row)
  - `button "Show more options"` (three dots)
- **Show thinking toggle:** `expand_more` / `expand_less` button — collapsible reasoning panel (**ULTRA exclusive**)
- **Listen button:** `button "Listen"` with `volume_up` icon — TTS of response text

### ULTRA vs PRO Differences
| Feature | ULTRA | PRO |
|---------|-------|-----|
| **Generation time** | 2-3 mins | 1-2 mins |
| **"Show thinking" toggle** | ✅ Present | ❌ Absent |
| **Share button locations** | 2 (player + feedback) | 1 (player only) |
| **Account indicator** | "ULTRA" badge | "WORK" badge |

### Shim Workflow (Create Videos)
1. Open Tools → click **Create videos (Veo 3.1)**
2. Confirm active: detect `button "Deselect Video"` near input (icon: `movie`)
3. Placeholder changes to "Describe your video"
4. Type video description into textbox
5. Press Enter
6. **Long poll needed:** Watch for "Generating your video..." card to disappear (2-3 mins)
7. Detect completion: presence of `button "Play video"` / `button "Good response"`
8. Extract video from player (format TBD — video element in paragraph)
9. Optional: click thinking toggle to expand/read reasoning steps

### Screenshots
- `memory/gemini-ultra-tool-videos-activated.png` (tool activated)
- `memory/gemini-ultra-tool-videos-generating.png` (generation in progress)
- `memory/gemini-ultra-tool-videos-response.png` (completed video)
- `memory/gemini-ultra-tool-videos-controls.png` (player controls)

---

## 🖼️ Create Images — Tool Mapping (ULTRA Account 2026-02-13)

### Activation
- **Toggle:** `menuitemcheckbox "Create images"` in Tools menu
- **Available in:** Fast mode (standard image gen), Thinking mode (Nano Banana Pro)

### UI Changes When Active
1. **Placeholder text changes:** "Ask Gemini 3" → **"Describe your image"**
2. **Active tool chip:** `button "Deselect Image"` (icon: **Google 4-color diamond** 🔶 — **ULTRA exclusive**, PRO shows 🔥 fire emoji)
3. **No layout split** — stays in standard single-column chat layout

### Deactivation
- Click `button "Deselect Image"` chip to disable

### Response Flow (Image Generation)
1. **Fast generation** — image appears directly (no "generating..." card)
2. **Blue sparkle icon** (✨) appears as Gemini response marker
3. **Single image** rendered inline (not a grid/carousel)

### Image Result Rendering (ULTRA Account)
- **Image card:** Single large inline image
- **Image controls (on image overlay / below image):**
  - `button "Image of"` — opens image detail/viewer (contains embedded `img` element)
  - `button "Share image"` (icon: `share`) — **ULTRA: appears on image**
  - `button "Copy image"` (icon: `content_copy`) — copies to clipboard
  - `button "Download full size image"` (icon: `download`) — downloads the image
- **Feedback buttons (below image):**
  - `button "Good response"` (thumbs up)
  - `button "Bad response"` (thumbs down)
  - `button "Redo"` (icon: `refresh`) — regenerate image
  - `button "Share image"` (icon: `share`) — **ULTRA: appears TWICE** (image controls + feedback row)
  - `button "Show more options"` (three dots)
- **Nano Banana Pro notifications (ULTRA exclusive):**
  - **Hint below image:** "You can redo this image with Nano Banana Pro." (appears as tooltip/hint)
  - **Toast notification:** Dialog element: "Nano Banana Pro is now available for images. Switch to Thinking to try it." (appears bottom-right)

### ULTRA vs PRO Differences
| Feature | ULTRA | PRO |
|---------|-------|-----|
| **Chip icon** | Google 4-color diamond 🔶 | Fire emoji 🔥 |
| **Share button locations** | 2 (image + feedback) | 1 (feedback only) |
| **Nano Banana Pro notifications** | ✅ Yes (toast + hint) | ❌ No |
| **Account indicator** | "ULTRA" badge | "WORK" badge |

### Shim Workflow (Create Images)
1. Open Tools → click **Create images**
2. Confirm active: detect `button "Deselect Image"` near input (icon: Google diamond)
3. Placeholder changes to "Describe your image"
4. Type image description into textbox
5. Press Enter
6. Poll snapshots until image controls appear (`button "Image of"`, `button "Download full size image"`)
7. Extract image from `button "Image of"` embedded `img` element or use Download button
8. Note: Nano Banana Pro toast may appear — dismiss or ignore for automation
9. Optional: Switch to Thinking mode for Nano Banana Pro variant (higher quality)

### Screenshots
- `memory/gemini-ultra-tool-images-activated.png` (tool activated)
- `memory/gemini-ultra-tool-images-response.png` (completed image with Nano Banana Pro notifications)

---

## 📝 Canvas — Tool Mapping (2026-02-13)

### Activation
- **Toggle:** `menuitemcheckbox "Canvas"` in Tools menu
- **Available in:** Fast mode (confirmed)

### UI Changes When Active
1. **Placeholder text changes:** "Enter a prompt for Gemini" → **"Let's write or build together"**
2. **Active tool chip:** `button "Deselect Canvas"` appears near input (icon: `note_stack_add` + close `x`)
3. **Layout splits:** Chat panel shrinks to left ~40%, **Canvas panel** opens on right ~60%
4. **Canvas panel** is a full code/document editor

### Canvas Panel Structure (Right Side)
| Element | Ref | Description |
|---------|-----|-------------|
| **Title bar** | heading level=2 | Shows artifact name (e.g., "Fibonacci Calculator") |
| **Code icon** | img `code_blocks` | Indicates code artifact type |
| **Cloud save indicator** | button with `cloud_done` icon | Auto-save status |
| **Undo** | button with `undo` icon | Undo edits |
| **Redo** | button with `redo` icon | Redo edits |
| **Show console** | `button "Show console"` (icon: `terminal`) | Toggle execution console |
| **History** | button with `history` icon | Version history |
| **Run code** | `button "Run code"` (icon: `play_circle`) | Execute code in sandbox |
| **Export to Colab** | `button "Export to Colab"` | Export as Colab notebook |
| **Share and export** | `button "Share and export canvas"` (icon: `share`) | Sharing options |
| **Close panel** | `button "Close panel"` (icon: `close`) | Close Canvas panel |
| **Code editor** | `textbox "Code Editor"` | Full editable code editor with line numbers |

### Response Rendering (Canvas Mode)
- Gemini generates code/content directly into the Canvas panel (not inline in chat)
- Chat side shows:
  - Explanatory text about what was created
  - **Canvas artifact card:** Shows artifact name + timestamp (e.g., "Fibonacci Calculator, Feb 13, 2:22 PM") with `code_blocks` icon
  - `button "Try again without Canvas"` — option to redo without Canvas
  - Standard feedback buttons (thumbs up/down, copy, more options)

### Key Differences from Normal Chat
1. **Split layout** — chat on left, live editor on right
2. **Editable output** — code/text is in a real editor, not read-only markdown
3. **Execution** — "Run code" button executes Python in a sandbox
4. **Console** — "Show console" reveals execution output
5. **Version control** — undo/redo + history for iterating
6. **Export** — direct export to Google Colab
7. **Iterative** — user can type follow-up prompts to modify the Canvas content

### Shim Workflow (Canvas)
1. Open Tools → click **Canvas**
2. Confirm active: detect `button "Deselect Canvas"` near input
3. Placeholder changes to "Let's write or build together"
4. Type code/writing request into textbox
5. Press Enter
6. Poll snapshots until Canvas panel appears (detect `textbox "Code Editor"` or `button "Close panel"`)
7. Extract code/content from the Code Editor textbox
8. Optional: click "Run code" to execute, then read console output

### Screenshot
- `memory/gemini-tool-canvas-active.png`

---

## 📚 Guided Learning — Tool Mapping (2026-02-13)

### Activation
- **Toggle:** `menuitemcheckbox "Guided Learning"` in Tools menu (icon: `auto_stories`)
- **Available in:** Fast mode (confirmed)

### UI Changes When Active
1. **Placeholder text changes:** "Enter a prompt for Gemini" → **"What do you want to learn?"**
2. **Active tool chip:** `button "Deselect Guided Learning"` appears near input (icon: `auto_stories` + close `x`)
3. **No layout split** — stays in standard single-column chat layout (unlike Canvas)

### Deactivation
- Click `button "Deselect Guided Learning"` chip to disable

### Response Flow (Guided Learning)
Guided Learning responses are distinctly different from normal chat:
1. **Rich inline images** — Gemini embeds educational diagrams (e.g., from Getty Images) directly in the response
   - Image buttons: `button "Image of [description]"` (clickable, shows full image)
   - Images are embedded `img` elements with descriptive alt text
2. **Structured educational content** — Response uses numbered/bulleted lists with topic breakdowns
3. **Guiding questions** — Response ends with multiple learning path options presented as a numbered list
   - e.g., "The Solar Panels: Explore how chlorophyll captures light..."
   - e.g., "The Sugar Factory: Dive into the Calvin Cycle..."
   - e.g., "Environmental Impact: Discuss how factors like light intensity..."
4. **Emoji markers** — Uses relevant emoji (🍃, ☀️, 🍎) to make content engaging
5. **Chemical formulas** — Renders subscript chemical notation (H₂O, CO₂, O₂)
6. **Standard feedback buttons** — thumbs up/down, copy, more options (same as normal chat)
7. **Chat auto-titled** — Gets descriptive title (e.g., "Photosynthesis: Sunlight to Sugar")

### Key Differences from Normal Chat
1. **Educational framing** — Responses structured as lessons, not just answers
2. **Inline images** — Educational diagrams embedded in response (from image search)
3. **Interactive learning path** — Offers branching topics for the user to explore
4. **Socratic method** — "I'll be asking guiding questions along the way"
5. **No canvas/split view** — Same layout as normal chat

### Shim Workflow (Guided Learning)
1. Open Tools → click **Guided Learning**
2. Confirm active: detect `button "Deselect Guided Learning"` near input
3. Placeholder changes to "What do you want to learn?"
4. Type learning topic into textbox
5. Press Enter
6. Poll snapshots until response completes (no "Stop response" button present)
7. Extract text content — note embedded images via `button "Image of ..."` elements
8. Follow-up prompts continue the learning conversation (choose a topic branch or ask new question)

### Screenshot
- `memory/gemini-tool-guided-learning.png`

---

## 🧠 Deep Think — Tool Mapping (2026-02-13)

### Activation
- **Toggle:** `menuitemcheckbox "Deep Think"` in Tools menu (icon: `mindfulness` 🧘)
- **Available in:** Fast mode (confirmed)

### UI Changes When Active
1. **Placeholder text changes:** "Enter a prompt for Gemini" → **"Ask a complex question"**
2. **Active tool chip:** `button "Deselect Deep Think"` appears near input (icon: `mindfulness` + close `x`)
3. **No layout split** — stays in standard single-column chat layout

### Deactivation
- Click `button "Deselect Deep Think"` chip to disable

### Response Flow (Deep Think)
1. **Immediate acknowledgment:** "I'm on it. Responses with Deep Think can take some time, so check back in a bit."
2. **Generation card:** Gray card appears: "Generating your response... Check back later" with animated mindfulness icon
3. **Stop button:** `button "Stop response"` (blue square icon) replaces Microphone during generation
4. **Generation time:** Significantly longer than normal (30+ seconds, up to minutes)
5. **Completion:** Generation card disappears, answer text appears below "Show thinking"

### Thinking Panel (Expandable)
- **Toggle button:** Unlabeled button with `expand_more` / `expand_less` icon (next to blue sparkle ✨)
- **Visual label:** "Show thinking ∨" text visible in screenshot
- When expanded:
  - Shows structured reasoning steps as labeled paragraphs
  - **Format:** Bold section headers (e.g., "Defining the Task", "Confirming Standard Output") followed by reasoning text
  - Reasoning includes internal monologue about approach, code execution, verification
  - Icon changes to `expand_less` (collapse)

### Key Differences from Regular "Thinking" Mode
| Aspect | Thinking Mode (mode picker) | Deep Think (tool toggle) |
|--------|---------------------------|------------------------|
| **Activation** | Mode picker dropdown | Tools menu toggle |
| **Placeholder** | TBD (mapping below) | "Ask a complex question" |
| **UI indicator** | Mode label changes | Chip "Deep Think ×" near input |
| **Generation time** | Moderate | Much longer ("check back in a bit") |
| **Generation card** | None (inline streaming) | "Generating your response... Check back later" card |
| **Thinking panel** | "Show thinking" collapsible | Same "Show thinking" collapsible |
| **Reasoning depth** | Standard chain-of-thought | Extended deliberation with code execution |

### Response UI Elements (Completed)
- **Show thinking toggle:** Button with `expand_more`/`expand_less` + blue sparkle icon
- **Answer text:** Standard paragraphs below thinking toggle
- **Feedback buttons:** Good response (👍), Bad response (👎), Redo (🔄), Copy, Show more options
- **Redo button present** (unlike some other tools) — allows regeneration
- **Listen button** with `volume_up` icon — TTS of response

### Shim Workflow (Deep Think)
1. Open Tools → click **Deep Think**
2. Confirm active: detect `button "Deselect Deep Think"` near input
3. Placeholder changes to "Ask a complex question"
4. Type complex question into textbox
5. Press Enter
6. **Long poll needed:** Watch for "Generating your response" card to disappear
7. Detect completion: presence of `button "Good response"` / absence of `button "Stop response"`
8. Extract answer from paragraphs below "Gemini said" heading
9. Optional: click thinking toggle to expand/read reasoning steps

### Screenshots
- `memory/gemini-tool-deep-think-processing.png` (generation in progress)
- `memory/gemini-tool-deep-think-response.png` (completed response)

---

## 🔀 Mode Switching — Full Mapping (2026-02-13)

### Mode Picker Control
- **Button:** `button "Open mode picker"` with `keyboard_arrow_down` icon
- **Location:** Bottom-right of input bar, next to Microphone button
- **Behavior:** Click opens a dropdown dialog with `menuitemradio` options
- **State:** Shows `[expanded]` when dropdown is open
- **Visual label on button:** Shows current mode name (e.g., "Fast ∨", "Thinking ∨", "Pro ∨")

### Available Modes (ULTRA Tier)

| Mode | ARIA Label | Description | Badge |
|------|-----------|-------------|-------|
| **Fast** | `menuitemradio "Fast Answers quickly New"` | Quick responses, standard generation | "New" tag |
| **Thinking** | `menuitemradio "Thinking Solves complex problems New"` | Chain-of-thought reasoning | "New" tag (sometimes) |
| **Pro** | `menuitemradio "Pro Thinks longer for advanced math & code"` | Extended reasoning for math/code | No tag |

### State Detection
- **Selected mode:** The active `menuitemradio` has `[checked]` attribute + `check_circle` icon
- **Button label changes:** The mode picker button text updates to show selected mode name
- **Placeholder text:** Same across all modes — **"Ask Gemini 3"**
- **Quick action buttons:** Same across all modes (Create image, Write anything, Boost my day, Create video, Help me learn)
- **Layout:** No visual layout changes between modes

### Per-Mode Observations

#### Fast Mode
- **Picker button shows:** "Fast ∨"
- **Placeholder:** "Ask Gemini 3"
- **Tools available:** All 6 (Deep Research, Create videos, Create images, Canvas, Guided Learning, Deep Think)
- **Response style:** Direct, quick answers without thinking panel
- **Screenshot:** `memory/gemini-ultra-mode-fast.png`

#### Thinking Mode
- **Picker button shows:** "Thinking ∨"
- **Placeholder:** "Ask Gemini 3"
- **Tools available:** All 6 (same as Fast)
- **Response style:** Includes "Show thinking" collapsible panel with chain-of-thought
- **Special:** Image generation uses "Nano Banana Pro" in this mode
- **Screenshot:** `memory/gemini-ultra-mode-picker.png`

#### Pro Mode
- **Picker button shows:** "Pro ∨"
- **Placeholder:** "Ask Gemini 3"
- **Tools available:** All 6 (same as Fast)
- **Response style:** Extended thinking for complex math & code problems
- **Screenshot:** (captured in mode-picker-click screenshot)

### Mode Switching Shim Workflow
1. Click `button "Open mode picker"` (detect by label or `keyboard_arrow_down` icon)
2. Wait for dropdown — detect by presence of `menuitemradio` elements
3. Click desired mode's `menuitemradio`
4. Dropdown auto-closes
5. Confirm by re-snapshotting: check mode picker button text changes
6. Mode persists across new messages in same conversation

### Important Notes
- Mode is **per-conversation** — changing mode in an ongoing chat creates a new context
- All tools work in all modes (same 6 tools available regardless of mode)
- The mode affects the underlying model/reasoning approach, not the UI layout
- "New" badges on Fast and Thinking modes indicate recently added features
- Mode selection dropdown is a custom widget (not native `<select>`), uses `menuitemradio` ARIA pattern

### WORK Account Differences (team@yallax.tech — observed accidentally)
- **No ULTRA badge** — shows "WORK" instead
- **Placeholder:** "Enter a prompt for Gemini" (not "Ask Gemini 3")
- **Fewer quick actions:** Only 4 buttons (no "Create video")
- **Shows "encrypted" text** near input (workspace encryption indicator)
- **URL:** Uses `/u/0/` path

---

## 📊 Summary — All Tools & Modes (ULTRA Account)

### Tool Activation Summary

| Tool | Placeholder When Active | Chip Label | Icon | Layout Change |
|------|------------------------|------------|------|---------------|
| Deep Research | "What do you want to research?" | "Deselect Deep Research" | `travel_explore` | No split; adds Sources dropdown |
| Create Videos (Veo 3.1) | "Describe your video" | "Deselect Video" | `movie` | No split |
| Create Images | "Describe your image" | "Deselect Image" (with 🔥) | N/A | No split |
| Canvas | "Let's write or build together" | "Deselect Canvas" | `note_stack_add` | **Split layout** — chat left, editor right |
| Guided Learning | "What do you want to learn?" | "Deselect Guided Learning" | `auto_stories` | No split |
| Deep Think | "Ask a complex question" | "Deselect Deep Think" | `mindfulness` | No split |

### Mode Summary

| Mode | Picker Label | Response Style | Special Features |
|------|-------------|----------------|-----------------|
| Fast | "Fast ∨" | Quick, direct answers | Standard image gen |
| Thinking | "Thinking ∨" | Chain-of-thought with "Show thinking" | Nano Banana Pro for images |
| Pro | "Pro ∨" | Extended reasoning | Optimized for math & code |

### Common UI Patterns (for Shim)
1. **Tool activation detection:** Look for `button "Deselect [ToolName]"` near input
2. **Response completion:** Absence of `button "Stop response"` + presence of `button "Good response"`
3. **Mode detection:** Read text content of mode picker button
4. **Thinking panel:** Collapsible via button with `expand_more`/`expand_less` icon
5. **New chat reset:** Navigate to `/u/1/app` to clear all state

---

## 📝 Canvas — Tool Mapping (2026-02-13)

### Activation
- **Toggle:** `menuitemcheckbox "Canvas"` in Tools menu
- **Available in:** Fast mode (confirmed on both WORK/PRO and personal ULTRA accounts)

### UI Changes When Active
1. **Placeholder text changes:** → **"Let's write or build together"**
2. **Active tool chip:** `button "Deselect Canvas"` (label: "Canvas", icon: canvas/document icon with X)
3. **Quick action buttons** remain unchanged

### Deactivation
- Click `button "Deselect Canvas"` chip to disable

### Response Flow (Canvas — Code Prompt)
1. Gemini generates both a **chat response** (left pane) and a **canvas artifact** (right pane)
2. **Split-pane layout** activates: chat on left, canvas editor on right
3. **Chat response includes:**
   - Description of what was created
   - **Canvas card:** Shows canvas title + timestamp (e.g., "Fibonacci Calculator, Feb 13, 2:22 PM") — clickable to open canvas
   - `button "Try again without Canvas"` — opt-out CTA below the canvas card
   - Follow-up conversational text
   - Standard feedback: Good response, Bad response, Copy, Show more options
4. **`button "Listen"`** for TTS of response
5. **Share conversation button** appears in top bar: `button "Share conversation"`

### Canvas Editor Panel (Right Pane)
The canvas panel is a full code editor with these controls:

| Element | Role/Label | Purpose |
|---------|-----------|---------|
| **Title** | `heading "Fibonacci Calculator"` (level 2) | Canvas name |
| **Cloud/save** | unnamed button (cloud icon) | Save state |
| **Previous version** | `button "Previous version"` | Navigate to older version (disabled initially) |
| **Next version** | `button "Next version"` | Navigate to newer version (disabled initially) |
| **Show console** | `button "Show console"` | Toggle console/output panel |
| **Show recent changes** | `button "Show recent changes"` | Diff view (disabled initially) |
| **Run code** | `button "Run code"` | Execute code in browser sandbox |
| **Export to Colab** | `button "Export to Colab"` | Export to Google Colab (prominent blue button) |
| **Share and export** | `button "Share and export canvas"` | Sharing options |
| **Close panel** | `button "Close panel"` | Close canvas pane, return to normal chat |
| **Code Editor** | `textbox "Code Editor"` | Editable code area with line numbers and syntax highlighting |

### Canvas Features
- **Line numbers** visible
- **Syntax highlighting** for Python code
- **Version history** (Previous/Next version buttons)
- **Console** for running code output
- **Export to Colab** — one-click Google Colab export
- **Inline editing** — code is editable directly in the canvas

### Shim Workflow (Canvas)
1. Open Tools → click **Canvas**
2. Confirm active: detect `button "Deselect Canvas"` near input
3. Type prompt into textbox (placeholder "Let's write or build together")
4. Press Enter
5. Poll snapshots until canvas panel appears (detect `button "Close panel"` or `textbox "Code Editor"`)
6. Extract code from the Code Editor textbox
7. Canvas title from the heading element
8. Note: Canvas creates a named artifact with version history

### Important Notes
- Canvas can handle both **code** and **writing** tasks (placeholder says "write or build")
- The split-pane layout significantly changes the page structure
- Canvas artifacts appear in chat history with title + timestamp
- `button "Try again without Canvas"` allows falling back to normal response

### Screenshot
- `memory/gemini-tool-canvas-response.png`

---

## 📚 Guided Learning — Tool Mapping (2026-02-13)

### Activation
- **Toggle:** `menuitemcheckbox "Guided Learning"` in Tools menu
- **Available in:** Fast mode (confirmed on ULTRA account)

### UI Changes When Active
1. **Placeholder text changes:** → **"What do you want to learn?"**
2. **Active tool chip:** `button "Deselect Guided Learning"` (label: "Guided Learning", icon: book/learning icon)
3. **Quick action buttons** remain unchanged

### Deactivation
- Click `button "Deselect Guided Learning"` chip to disable

### Response Flow (Guided Learning)
1. **Structured educational response** — not just text, but a teaching-style format
2. **Inline images** from stock sources (Getty Images, Shutterstock) — rendered as clickable buttons:
   - `button "Image of chloroplast structure"` (with "Getty Images" attribution text)
   - `button "Image of photosynthesis overview diagram"` (with "Shutterstock" attribution text)
3. **Emoji integration** for visual engagement (🍃, ☀️, 🍎)
4. **Bold key terms** in the response
5. **Guiding questions** at the end — offers multiple exploration paths to dive deeper
6. Response ends with an interactive prompt: "Where would you like to start our exploration?"

### Response Elements
- `button "Listen"` — TTS of response
- `button "Good response"` / `button "Bad response"` — feedback
- `button "Copy"` — copy response
- `button "Show more options"` — three dots menu
- `button "Share conversation"` — in top bar

### Key Difference from Normal Chat
- Normal chat gives direct answers; Guided Learning creates a **tutoring session**
- Responses include **stock images** with attribution (not AI-generated images)
- Ends with **follow-up exploration options** to continue learning
- Maintains educational tone throughout

### Shim Workflow (Guided Learning)
1. Open Tools → click **Guided Learning**
2. Confirm active: detect `button "Deselect Guided Learning"` near input
3. Type learning topic into textbox (placeholder "What do you want to learn?")
4. Press Enter
5. Poll until response appears (detect `button "Good response"`)
6. Parse response — contains text, inline images (as button elements with alt text), and follow-up options
7. Note: Response includes stock images, not AI-generated

### Screenshot
- `memory/gemini-tool-guided-learning-response.png`

---

## 🧠 Deep Think — Tool Mapping (2026-02-13)

### Activation
- **Toggle:** `menuitemcheckbox "Deep Think"` in Tools menu
- **Available in:** Fast mode on ULTRA account. NOT visible on WORK/PRO account in Fast mode.
- **Note:** Deep Think is a **tool** (toggle), NOT a mode. It can be used alongside the Fast/Thinking/Pro mode picker.

### UI Changes When Active
1. **Placeholder text changes:** → **"Ask a complex question"**
2. **Active tool chip:** `button "Deselect Deep Think"` (label: "Deep Think")
3. **Mode picker** still shows current mode (e.g., "Fast") — independent of Deep Think

### Deactivation
- Click `button "Deselect Deep Think"` chip to disable

### Response Flow (Deep Think)
1. **Long generation time** — similar to Deep Research, takes significantly longer than normal
2. **Initial status text:** "I'm on it. Responses with Deep Think can take some time, so check back in a bit."
3. **Generation indicator:** "Generating your response… Check back later"
4. **Stop button:** `button "Stop response"` replaces Microphone during generation
5. **Thinking toggle:** `status "Show thinking"` — collapsible reasoning panel (appears during/after generation)
6. **Listen button:** `button "Listen"` appears for TTS
7. **Edit button:** `button "Edit"` (disabled during generation)

### Key Differences from Thinking Mode
| Aspect | Thinking Mode | Deep Think Tool |
|--------|--------------|-----------------|
| **Activation** | Mode picker → "Thinking" | Tools menu → "Deep Think" toggle |
| **Placeholder** | TBD (checking in mode section) | "Ask a complex question" |
| **Generation time** | Moderate (seconds) | Long (minutes — "check back later") |
| **Can combine** | No (mode is exclusive) | Yes (can be used with any mode) |
| **Availability** | All tiers | ULTRA only (not visible on WORK/PRO) |
| **Status message** | No "check back" message | "Check back in a bit" / "Check back later" |

### Shim Workflow (Deep Think)
1. Open Tools → click **Deep Think**
2. Confirm active: detect `button "Deselect Deep Think"` near input
3. Type complex question into textbox (placeholder "Ask a complex question")
4. Press Enter
5. Poll snapshots — watch for status text changes:
   - "I'm on it. Responses with Deep Think can take some time..."
   - "Generating your response… Check back later"
   - Eventually the answer replaces the status text
6. Detect completion: `button "Stop response"` disappears, feedback buttons appear
7. Note: Can take minutes — implement long polling or periodic checks

### Deep Think Response (Completed)
- **Direct answer** with bold key value (e.g., **24,133**)
- **Context paragraph** with explanation
- **Thinking toggle:** `status "Show thinking"` — collapsible, shows reasoning process
- **Blue sparkle icon** (✨) as response marker
- **Edit button** becomes enabled after completion
- **Feedback buttons:** Good/Bad response, Redo, Copy, Show more options
- **Deep Think chip** with brain icon persists in input area after response

### Screenshot
- `memory/gemini-tool-deep-think-response.png`

---

## 🔄 Mode Switching — Detailed Mapping (2026-02-13)

### Mode Picker
- **Trigger:** `button "Open mode picker"` (shows current mode name + down arrow icon)
- **When expanded:** Shows `[expanded]` attribute
- **Header:** "Gemini 3" text above mode options
- **Layout:** Dropdown popup with radio items

### Available Modes

| Mode | Role | Description | Badge | Available |
|------|------|-------------|-------|-----------|
| **Fast** | `menuitemradio "Fast Answers quickly New"` | Quick responses | **New** | All tiers |
| **Thinking** | `menuitemradio "Thinking Solves complex problems New"` | Extended reasoning | **New** | All tiers |
| **Pro** | `menuitemradio "Pro Thinks longer for advanced math & code"` | Deep reasoning for math/code | — | All tiers |

### State Detection
- **Checked mode:** The active mode has `[checked]` attribute
- **Mode picker label:** Shows current mode name (e.g., "Fast", "Thinking", "Pro")

### Per-Mode UI Comparison

#### Fast Mode
| Property | Value |
|----------|-------|
| **Placeholder (ULTRA)** | "Ask Gemini 3" |
| **Placeholder (WORK/PRO)** | "Enter a prompt for Gemini" |
| **Quick actions (ULTRA)** | Create image, Boost my day, Create video, Help me learn, Write anything (5) |
| **Quick actions (WORK/PRO)** | Create image, Help me learn, Write anything, Boost my day (4, no Create video) |
| **Tools available (ULTRA)** | All 6: Deep Research, Create videos, Create images, Canvas, Guided Learning, Deep Think |
| **Tools available (WORK/PRO)** | 5: Deep Research, Create videos, Create images, Canvas, Guided Learning (no Deep Think) |
| **Badge** | ULTRA or PRO + WORK |

#### Thinking Mode
| Property | Value |
|----------|-------|
| **Placeholder (ULTRA)** | "Ask Gemini 3" |
| **Quick actions** | Same as Fast |
| **Tools available (ULTRA)** | All 6 (same as Fast) |
| **Badge** | Same as account tier |
| **Key difference** | Responses include "Show thinking" toggle by default |

#### Pro Mode
| Property | Value |
|----------|-------|
| **Placeholder (ULTRA)** | "Ask Gemini 3" |
| **Quick actions** | Same as Fast |
| **Tools available (ULTRA)** | All 6 (same as Fast) |
| **Badge** | Same as account tier |
| **Key difference** | Longer processing for math/code, similar to Thinking but extended |

### Mode Switching Workflow
1. Click `button "Open mode picker"` (shows current mode name)
2. Mode picker dropdown appears with `menuitemradio` items
3. Click desired mode — it becomes `[checked]`
4. Dropdown closes automatically
5. Mode picker button label updates to new mode name
6. Placeholder text may change (varies by account tier, not by mode)

### Key Observations
- **Modes don't change the placeholder text** within the same account — all 3 modes show "Ask Gemini 3" on ULTRA
- **Modes don't change available tools** — all 6 tools available in all modes on ULTRA
- **Account tier matters more than mode** for UI differences:
  - ULTRA: "Ask Gemini 3", 5 quick actions, 6 tools, Deep Think available
  - WORK/PRO: "Enter a prompt for Gemini", 4 quick actions, 5 tools, no Deep Think
- **Mode affects response behavior**, not UI elements:
  - Fast: Quick responses, no thinking toggle
  - Thinking: Includes "Show thinking" toggle in responses
  - Pro: Longer processing, includes thinking toggle
- **"New" badges** on Fast and Thinking modes (not on Pro)

### Account-Level Differences (Important for Shim)

| Feature | ULTRA (/u/1/) | PRO + WORK (/u/0/) |
|---------|---------------|---------------------|
| **URL base** | `/u/1/app` | `/u/0/app` |
| **Badge** | "ULTRA" | "PRO" + "WORK" |
| **Placeholder** | "Ask Gemini 3" | "Enter a prompt for Gemini" + "encrypted" |
| **Quick actions** | 5 (includes Create video) | 4 (no Create video) |
| **Tools** | 6 (includes Deep Think) | 5 (no Deep Think) |
| **Account button** | Standard avatar | "WORK, Google Account: Emile Sawaya (team@yallax.tech)" |

### Screenshot
- `memory/gemini-mode-picker-open.png`

