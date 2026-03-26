# AI Studio E2E Assumption Tests
**Date**: 2026-02-14
**Browser**: CDP on port 18800
**Account**: team@yallax.tech (emilesawaya123@gmail.com)
**Default Model**: Gemini 3 Flash Preview (gemini-3-flash-preview)

## Summary
| # | Test | Result | Notes |
|---|------|--------|-------|
| 1 | Send prompt | **PASS** | textarea + Ctrl+Enter or Run button works, model responds correctly |
| 2 | Switch models | **PASS** | 21 models available, model-selector-card button opens sliding panel |
| 3 | Toggle tools | **PASS** | 4/5 tools toggle correctly. Function calling is disabled by default |
| 4 | System instructions | **PASS** | Opens in dialog, textarea fills/persists, pirate response confirmed |
| 5 | Change temperature | **PASS** | Number input + slider, range 0-2, default 1 |
| 6 | Change thinking level | **PASS** | mat-select dropdown with 4 options: Minimal, Low, Medium, High |
| 7 | Upload a file | **PASS** | Add media menu has 6 options, file chooser works after "Acknowledge" consent |
| 8 | Get code | **PASS** | Sliding panel shows Python/curl code with API key placeholder |
| 9 | Stop generation | **PASS** | Stop button appears during generation, clicking it halts output |
| 10 | Prompt gallery | **PASS** | 66 app cards at /apps?source=showcase, 6 category cards on new chat |
| 11 | Tuned models | **N/A** | No tuned models page found in current UI. Build section has Start/Gallery/Apps/FAQ |
| 12 | API keys | **PASS** | Full API key management page at /apikey with create/copy/billing controls |

---

## Test 1: Send Prompt
**Before**: Fresh chat page at `https://aistudio.google.com/prompts/new_chat`
**Action**: Typed "What is 2+2? Reply with just the number." in prompt textarea, clicked Run button
**After**: Model responded with "4" in 2.7 seconds
**Result**: **PASS**

**Selectors that worked**:
- Prompt input: `textarea[aria-label="Enter a prompt"]`
  - placeholder: `"Start typing a prompt, use alt + enter to append"`
  - class: `cdk-textarea-autosize textarea`
- Run button: `button` containing text "Run  Ctrl keyboard_return" (no specific aria-label)
  - Alternative: `Ctrl+Enter` keyboard shortcut
- Response: `ms-chat-turn` elements contain user and model turns
  - Model turn text accessible via `ms-chat-turn` > textContent

**Selectors that failed**: None

**Notes**:
- The Run button has no `aria-label` attribute, must be found by text content
- Response contains icon text like "thumb_up", "thumb_down" mixed with actual response
- The prompt auto-generates a title (e.g., "Simple Math Question")
- Token count shown in header (e.g., "15 tokens")

---

## Test 2: Switch Models
**Before**: Default model is "Gemini 3 Flash Preview" (gemini-3-flash-preview)
**Action**: Clicked model card, selected "Gemini 3 Pro Preview", then switched back
**After**: Model successfully changed and restored

**Result**: **PASS**

**Selectors that worked**:
- Model picker button: `button.model-selector-card`
- Model selection panel: `.cdk-overlay-pane` (sliding right panel dialog)
- Individual model options: `button.content-button` inside the overlay
- Filter chips: `button` with class `ms-button-filter-chip` (All, Featured, Gemini, Live, Images, Video, Audio)

**Available Models (21)**:
| Model | ID |
|-------|-----|
| Gemini 3 Pro Preview (New) | gemini-3-pro-preview |
| Nano Banana Pro (New, Paid) | gemini-3-pro-image-preview |
| Gemini 3 Flash Preview (New) | gemini-3-flash-preview |
| Nano Banana | gemini-2.5-flash-image |
| Gemini 2.5 Pro | gemini-2.5-pro |
| Gemini Flash Latest | gemini-flash-latest |
| Gemini Flash-Lite Latest | gemini-flash-lite-latest |
| Gemini 2.5 Flash | gemini-2.5-flash |
| Gemini 2.5 Flash-Lite | gemini-2.5-flash-lite |
| Gemini 2.0 Flash | gemini-2.0-flash |
| Gemini 2.0 Flash-Lite | gemini-2.0-flash-lite |
| Gemini Robotics-ER 1.5 Preview (New) | gemini-robotics-er-1.5-preview |
| Gemini 2.5 Flash Native Audio Preview | gemini-2.5-flash-native-audio |
| Gemini 2.5 Pro Preview TTS | gemini-2.5-pro-preview-tts |
| Gemini 2.5 Flash Preview TTS | gemini-2.5-flash-preview-tts |
| Imagen 4 (Paid) | imagen-4.0-generate-001 |
| Imagen 4 Ultra (Paid) | imagen-4.0-ultra-generate-001 |
| Imagen 4 Fast (Paid) | imagen-4.0-fast-generate-001 |
| Veo 3.1 (New, Paid) | veo-3.1-generate-preview |
| Veo 3.1 Fast (New, Paid) | veo-3.1-fast-generate-preview |
| Veo 2 (Paid) | veo-2.0-generate-001 |

**Notes**:
- Model selection opens a sliding panel from the right
- Each model shows pricing, knowledge cutoff (Jan 2025), and capabilities
- Models can be starred (favorited) and have a copy-ID button
- Filter chips help narrow by category

---

## Test 3: Toggle Tools
**Before**: Default state: Grounding ON, all others OFF. Function calling disabled.
**Action**: Toggled each tool ON then OFF
**After**: All toggleable tools returned to original state

**Result**: **PASS** (4/5 tools; Function calling disabled by default)

**Tool Toggle Details**:

| Tool | Selector | Default State | Toggle Works | Notes |
|------|----------|---------------|--------------|-------|
| Structured outputs | `button[aria-label="Structured outputs"]` | OFF (false) | YES (false->true->false) | Has "Edit" button for JSON schema |
| Code execution | `button[aria-label="Code execution"]` | OFF (false) | YES (false->true->false) | |
| Function calling | `button[aria-label="Function calling"]` | OFF (disabled) | N/A (disabled) | Has "Edit" button for function declarations |
| Grounding with Google Search | `button[aria-label="Grounding with Google Search"]` | ON (true) | YES (true->false->true) | Shows "Source: Google Search" chip |
| URL context | `button[aria-label="Browse the url context"]` | OFF (false) | YES (false->true->false) | |

**Toggle Element Structure**:
- Element: `<button role="switch" aria-checked="true|false">`
- Class when OFF: `mdc-switch mdc-switch--unselected`
- Class when ON: `mdc-switch mdc-switch--selected mdc-switch--checked`
- Parent: `<mat-slide-toggle>` with class `slide-toggle large`
- State read via: `getAttribute('aria-checked')` returns `"true"` or `"false"`

**Notes**:
- Function calling toggle is `disabled` by default - becomes enabled when function declarations are added via the "Edit" button
- Grounding with Google Search is ON by default and shows a chip below the input
- Tools section is expandable/collapsible via `button[aria-label="Expand or collapse tools"]`

---

## Test 4: System Instructions
**Before**: Empty system instructions
**Action**: Opened system instructions dialog, typed pirate instructions, sent prompt "Say hello"
**After**: Model responded "Ahoy there, matey! Avast ye and welcome aboard!"

**Result**: **PASS**

**Selectors that worked**:
- Open dialog: `button[aria-label="System instructions"]`
  - Text: "System instructionsOptional tone and style instructions for the model"
- Textarea inside dialog: `textarea[aria-label="System instructions"]`
  - Placeholder: `"Optional tone and style instructions for the model"`
- Close dialog: `Escape` key

**Notes**:
- System instructions open in a CDK overlay dialog (`.cdk-overlay-pane`)
- The dialog has a blurred backdrop (`.dialog-backdrop-blur-overlay`)
- Must dismiss dialog (Escape) before interacting with other page elements
- `inputValue()` confirms text persistence
- System instructions affect model behavior immediately (pirate speak confirmed)

---

## Test 5: Change Temperature
**Before**: Temperature = 1 (default)
**Action**: Changed to 0.5, verified, restored to 1
**After**: Temperature successfully changed and restored

**Result**: **PASS**

**Selectors that worked**:
- Number input: `input.slider-number-input` (class: `slider-number-input small`)
  - Located in right-side "Run settings" panel
- Range slider: `input[type="range"]` with `min="0"` `max="2"` (class: `mdc-slider__input`)
- Parent: `mat-slider` component

**Notes**:
- Temperature range: 0 to 2
- Default value: 1
- Can be set via the number input (click + type + Enter/Tab) or by dragging the slider
- Located in the "Run settings" panel on the right side
- The Run settings panel is open by default on the chat page

---

## Test 6: Change Thinking Level
**Before**: Thinking Level = "High" (default)
**Action**: Changed to "Minimal", verified, restored to "High"
**After**: Thinking level successfully changed and restored

**Result**: **PASS**

**Selectors that worked**:
- Dropdown: `mat-select[aria-label="Thinking Level"]`
- Options: `mat-option` elements inside CDK overlay
- Value display: `.mat-mdc-select-value-text span` inside the mat-select

**Available Options**: `["Minimal", "Low", "Medium", "High"]`

**Notes**:
- Default: "High"
- Opens standard Angular Material select dropdown
- Located in the "Run settings" panel on the right side
- Also visible: "Media resolution" dropdown (`mat-select[aria-label="Media resolution"]`) with default "Default"

---

## Test 7: Upload a File
**Before**: Fresh chat, no files attached
**Action**: Clicked add media button, selected "Upload files", chose test file
**After**: File upload mechanism confirmed working

**Result**: **PASS**

**Selectors that worked**:
- Add media button: `button[aria-label="Insert images, videos, audio, or files"]`
  - Icon text: "add_circle"
  - Located in the footer/input area
- Upload menu: Opens as CDK overlay with 6 options
- File input (hidden): `input[type="file"]` (appears after clicking "Upload files")

**Upload Menu Options**:
| Option | Icon | Text |
|--------|------|------|
| Drive | drive | Google Drive integration |
| Upload files | upload | Local file upload |
| Record Audio | mic | Audio recording |
| Camera | photo_camera | Camera capture |
| YouTube Video | videocam | YouTube URL input |
| Sample Media | image | Pre-loaded sample files |

**Notes**:
- First upload triggers a consent dialog: "Start creating with media in Google AI Studio" with "Acknowledge" and "Cancel" buttons
- Must click "Acknowledge" before uploads will work
- File chooser is a standard browser file dialog
- The hidden `input[type="file"]` appears dynamically after clicking "Upload files"
- Also supports drag-and-drop (dragging overlay: `.dragging-overlay` with text "Drop files here")

---

## Test 8: Get Code
**Before**: Chat page with Run settings panel open
**Action**: Clicked "Get code" button
**After**: Code panel opened showing Python code with genai library usage

**Result**: **PASS**

**Selectors that worked**:
- Get code button: `button[aria-label="Get code"]`
  - Text: "code Get code"
  - Located in the Run settings panel header
- Code panel content: `.cdk-overlay-pane` containing code blocks
- Close: `Escape` key

**Code Panel Features**:
- Shows Python code by default using `google-genai` library
- Includes: pip install command, import statements, API key placeholder
- Tabs available (Python, other languages)
- Has download button and "Open in Colab" link
- Code updates to reflect current model, system instructions, and settings

**Code Snippet Example**:
```python
# pip install google-genai
import os
from google import genai
from google.genai import types
...
```

---

## Test 9: Stop Generation
**Before**: Fresh chat page
**Action**: Sent long essay prompt, clicked Stop button after 3 seconds
**After**: Generation halted with partial response visible, Stop button disappeared

**Result**: **PASS**

**Selectors that worked**:
- Stop button: `button` containing text "progress_activityStop"
  - Icon: `progress_activity` (spinning indicator) + text "Stop"
  - No specific `aria-label` on this button
- Alternative detection: Look for visible button with text containing "Stop"

**Notes**:
- Stop button appears during generation, replacing the Run button area
- The `progress_activity` icon is a Material icon indicating loading/generation
- After clicking Stop, the button disappears and the Run button returns
- Partial response is preserved in the chat
- Generation indicator text may include "Thinking..." or "Generating..."

---

## Test 10: Prompt Gallery / Templates
**Before**: N/A
**Action**: Explored gallery at `/apps?source=showcase` and category cards on new chat page

**Result**: **PASS**

**Gallery Location**: `https://aistudio.google.com/apps?source=showcase`
- 66 app cards available
- Filter: Featured, All apps, Gemini 3, etc.

**Category Cards on New Chat Page** (6 categories):
1. **Featured** - "Our top picks including Gemini 3 Pro and Nano Banana Pro"
2. **Code, Reasoning, and Chat** - "Build chatbots, agents, and code with Gemini 3 Pro and Gemini 3 Flash"
3. **Image Generation** - "Create and edit images with Nano Banana and Imagen"
4. **Video Generation** - "Generate videos with Veo models"
5. **Text to Speech** - "Convert text to speech with lifelike realism using Gemini TTS"
6. **Real-time** - "Real-time voice and video with Gemini Live"

**Category Card Selector**: `button.category-card`

**Build Section Navigation** (at `/apps`):
- Start
- Gallery (`/apps?source=showcase`)
- Your apps (`/apps?source=user`)
- FAQ (`/apps?source=faq`)

**Sample Gallery Apps**:
- Flash UI, Voxel Toy Box, Shader Pilot, Research Visualization
- Function Call Kitchen, EchoPaths, Type Motion, Veo Studio
- Lumina Festival, Aura Quiet Living, Infinite Heroes, InfoGenius

**Notes**:
- No separate "prompt gallery" page - templates are bundled into the Build/Apps section
- `/prompts/new_freeform` redirects to "prompt-access-restricted" (may require specific permissions)
- Category cards on new chat page select a model/template combination

---

## Test 11: Tuned Models
**Before**: N/A
**Action**: Searched for tuned models section via navigation and direct URLs

**Result**: **N/A** (Feature not found in current UI)

**URLs Tested**:
- `https://aistudio.google.com/tuned_models` -> 404
- `https://aistudio.google.com/build/tuned_models` -> 404
- `https://aistudio.google.com/app/tuned_models` -> 404

**Build Section Contents**: Start, Gallery, Your apps, FAQ (no tuning option)

**Notes**:
- Tuned/fine-tuned models section appears to have been removed or relocated from the current AI Studio UI
- No "tune", "fine-tune", or "train" keywords found in the Build section
- The feature may have been moved to Google Cloud Console or deprecated for this account tier

---

## Test 12: API Keys
**Before**: N/A
**Action**: Navigated to API keys page at `/apikey`

**Result**: **PASS**

**URL**: `https://aistudio.google.com/api-keys`
(Note: `/apikey` redirects to `/api-keys`)

**Page Features**:
- Title: "API Keys"
- "Create API key" button available
- Table showing existing keys with columns: Key (truncated), Project, Created on, Quota tier
- Group by: API key / Project
- Filter by: All projects
- Each key row has: copy button, paid tier indicator, usage chart button
- Links: "API quickstart" documentation

**Dashboard Navigation** (at `/api-keys`):
- API keys (current)
- Projects
- Usage and Billing
- Logs and Datasets
- Changelog

**Existing Keys Found**: Yes (at least 1 key for "Gemeni Test Abrar" / "Tets Proj" project)

**Selectors**:
- Create key button: `button` containing text "Create API key"
- Key table: `table` element
- Copy key button: `button` containing "content_copy"
- Dashboard nav: sidebar links under "Dashboard" section

**Notes**:
- Key values are truncated in the UI (e.g., "...GIkI")
- Full key values are not exposed in the DOM (only visible on copy action)
- The page shows quota tier information per key

---

## Key Architectural Findings

### Page Structure
- **Framework**: Angular with Angular Material (CDK overlays, mat-select, mat-slide-toggle)
- **Component prefix**: `ms-` (e.g., `ms-chat-turn`, `ms-text-input`)
- **Overlay system**: CDK overlay container with backdrop blur for dialogs
- **Right panel**: "Run settings" panel with model selector, temperature, thinking level, tools

### Critical Selectors Summary
| Element | Selector | Notes |
|---------|----------|-------|
| Prompt input | `textarea[aria-label="Enter a prompt"]` | Main chat input |
| Run/Submit | Button containing "Run  Ctrl keyboard_return" | No aria-label |
| Submit shortcut | `Ctrl+Enter` | Always works |
| Model selector | `button.model-selector-card` | Opens sliding panel |
| Model options | `button.content-button` (inside overlay) | |
| System instructions (open) | `button[aria-label="System instructions"]` | Opens dialog |
| System instructions (input) | `textarea[aria-label="System instructions"]` | Inside dialog |
| Temperature (number) | `input.slider-number-input` | Range 0-2 |
| Temperature (slider) | `input[type="range"]` in mat-slider | |
| Thinking level | `mat-select[aria-label="Thinking Level"]` | Dropdown |
| Tool toggles | `button[aria-label="<tool name>"]` with `role="switch"` | aria-checked for state |
| Add media | `button[aria-label="Insert images, videos, audio, or files"]` | Opens menu |
| File input | `input[type="file"]` | Appears after "Upload files" click |
| Get code | `button[aria-label="Get code"]` | Opens code panel |
| Stop generation | Button containing "Stop" text | Appears during generation |
| New chat | `button` containing "add" with aria-label "New chat" | |
| Close settings | `button[aria-label="Close run settings panel"]` | |

### Default Settings
- Model: Gemini 3 Flash Preview
- Temperature: 1
- Thinking Level: High
- Media Resolution: Default
- Grounding with Google Search: ON
- All other tools: OFF
