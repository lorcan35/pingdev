# AI Studio App-Building Exploration
**Date**: 2026-02-14
**Browser**: CDP on port 18800
**Account**: team@yallax.tech

## Summary
| # | Mission | Status | Key Findings |
|---|---------|--------|-------------|
| 1 | Entry points | DONE | 5 main entry points: Playground, Build Start, Gallery, Your Apps, History |
| 2 | Model-specific flows | DONE | 21 models found across 7 categories; each has unique UI |
| 3 | Prompt Gallery | DONE | 21 bundled apps; each opens in IDE with Preview+Code+Chat |
| 4 | Build/Create App | DONE | Prompt-to-app flow creates temp app with Monaco editor |
| 5 | Prompt modes | DONE | Only chat mode available; freeform/structured/batch are restricted |
| 6 | Apps publish/share | DONE | Share via URL, Deploy to Cloud Run, Sync to GitHub, Download |
| 7 | API deployment | DONE | Cloud Run deployment, Get Code (Python SDK), Open in Colab |
| 8 | Category cards | DONE | 6 categories act as model-group navigation; each reveals sub-models |

---

## Mission 1: App Creation Entry Points

### Navigation Structure (Sidebar)
The sidebar has a persistent left navigation with these items:
| Icon | Label | URL | Description |
|------|-------|-----|-------------|
| home | Home | `/` | Dashboard with usage stats, quick start, recent chats |
| chat_spark | Playground | `/prompts/new_chat` | Main chat/prompt creation interface |
| (expand) | History | (expandable) | Shows recent prompts inline |
| (link) | View all history | `/library` | Full history view with Drive integration |
| design_services | Build | `/apps` | App building section with sub-pages |
| speed | Dashboard | `/api-keys` | API key management and usage |
| developer_guide | Documentation | `https://ai.google.dev/gemini-api/docs` | External docs (opens new tab) |

### Additional sidebar buttons (bottom):
- **Let it snow** (seasonal/fun feature)
- **Get API key** - Quick API key creation
- **Settings** - Opens menu with: Theme, Submit prompt key, View status, Terms of service, Privacy policy, Send feedback, Billing Support
- **Account** (`team@yallax.tech`) - Google account menu

### Entry Points for Creation

#### 1. Playground (Chat/Prompt Creation)
- **URL**: `https://aistudio.google.com/prompts/new_chat`
- **Entry**: Sidebar "Playground" link, or "New" button on Home page ("Try Gemini 3 Flash")
- **Features**: Model selector, system instructions, temperature, tools (structured outputs, code execution, function calling, grounding, URL browsing), media upload
- **Toolbar buttons**: Incognito toggle, Share, Compare, New chat (+), More actions (save, copy, delete, raw mode)
- **Action buttons**: "Run" (Ctrl+Enter), "Get code"
- **6 Category cards** at top: Featured, Code/Reasoning/Chat, Image Generation, Video Generation, Text to Speech, Real-time

#### 2. Build > Start (App Builder)
- **URL**: `https://aistudio.google.com/apps?source=`
- **Entry**: Sidebar "Build" link
- **Features**: Prompt-to-app builder with chat interface. Has model selector, file upload, speech-to-text, "I'm feeling lucky" button, and "Build" submit button
- **Template cards** (horizontal scroll): 17 capability cards including:
  - Nano banana powered app (photo editing)
  - Create conversational voice apps (Gemini Live API)
  - Animate images with Veo
  - Use Google Search data
  - Use Google Maps data
  - Generate images with Nano Banana Pro
  - Gemini intelligence in your app
  - AI powered chatbot
  - Prompt based video generation
  - Control image aspect ratios
  - Analyze images
  - Fast AI responses (2.5 Flash-Lite)
  - Video understanding
  - Transcribe audio
  - Think more when needed (Thinking Mode)
  - Generate speech (TTS)
- **Featured apps** at bottom: Flash UI, Voxel Toy Box, Shader Pilot, Research Visualization

#### 3. Build > Gallery
- **URL**: `https://aistudio.google.com/apps?source=showcase`
- **Entry**: Build section tab "Gallery"
- **Filters/Tags** (tab bar):
  - star Featured (default)
  - apps All apps
  - Gemini 3
  - Nano Banana
  - Games and Visualizations
  - GenMedia
  - Multimodal understanding
  - Tools and MCP
  - Code gen
  - Developer quickstarts
- **Items**: Links to bundled apps like `/apps/bundled/{app_name}?showPreview=true&showAssistant=true`

#### 4. Build > Your Apps
- **URL**: `https://aistudio.google.com/apps?source=user`
- **Entry**: Build section tab "Your apps"
- **Sub-tabs**: "Created by you", "Created by others"
- **Empty state buttons**: "Explore the gallery", "Create a new app"

#### 5. Build > FAQ
- **URL**: `https://aistudio.google.com/apps?source=faq`
- **Key facts learned**:
  - Apps run in browser in sandboxed iframe (no server-side component)
  - API keys use placeholder `process.env.GEMINI_API_KEY`
  - Apps stored in Google Drive, inherit Drive permissions
  - Can deploy to **Cloud Run** from AI Studio for public URL
  - Local development not yet supported
  - No Next.js/Svelte/Vue/Astro support (no compiler plugins)
  - Uses import map in index.html (served via esm.sh)
  - GitHub integration: create repo, commit changes (no pull from remote)

#### 6. Freeform Prompts
- **URL**: `https://aistudio.google.com/prompts/new_freeform`
- **Status**: BLOCKED - redirects to `/prompt-access-restricted` ("Prompt cannot be accessed")
- This mode appears to be deprecated or restricted

#### 7. Library (History)
- **URL**: `https://aistudio.google.com/library`
- **Features**: Lists all saved prompts with Name, Description, Type, Updated columns
- **Has**: "Open in Drive" link, dropdown filter "My history"

#### 8. Additional URLs
- `/usage` - Usage stats
- `/usage?tab=billing` - Billing tab
- `/logs` - API logs
- `/status` - Service status page
- `/api-keys` - API key management

### Playground "More Actions" Menu
| Icon | Label | Aria Label | Notes |
|------|-------|------------|-------|
| save | No changes to save | Save prompt | Saves current prompt state |
| content_copy | Make a copy | Make a copy | Duplicate prompt |
| delete | Delete | Delete prompt | Remove prompt |
| text_compare | Raw Mode | Toggle viewing raw output | Shows raw model output |

### Playground Right Panel (Run Settings)
- **Model selector** (e.g., "Gemini 3 Flash Preview")
- **System instructions** - Optional tone/style instructions
- **API Key** selector - "No API Key" with warning about quota
- **Media resolution** - Default, adjustable via mat-select
- **Thinking Level** - Default: "High", adjustable via mat-select
- **Tools section** (expandable):
  - Structured outputs (with JSON schema editor)
  - Code execution (toggle)
  - Function calling (with function declaration editor)
  - Grounding with Google Search (toggle)
  - Browse the url context (toggle)
- **Advanced settings** (expandable)

---

## Mission 2: Model-Specific Creation Flows

### Complete Model Registry (21 models)

| # | Name | Model ID | Category | Pricing | Knowledge Cutoff |
|---|------|----------|----------|---------|-----------------|
| 1 | Gemini 3 Pro Preview | `gemini-3-pro-preview` | Featured/Gemini | $2/$12 (<=200K), $4/$18 (>200K) | Jan 2025 |
| 2 | Nano Banana Pro (Gemini 3 Pro Image) | `gemini-3-pro-image-preview` | Images | $2/$12 text, $2/$0.134 per image | Jan 2025 |
| 3 | Gemini 3 Flash Preview | `gemini-3-flash-preview` | Featured/Gemini | $0.50/$3.00 | Jan 2025 |
| 4 | Nano Banana (Gemini 2.5 Flash Image) | `gemini-2.5-flash-image` | Images | $0.30/$2.50 text, $0.30/$0.039 per image | Jun 2025 |
| 5 | Gemini 2.5 Pro | `gemini-2.5-pro` | Gemini | $1.25/$10 (<=200K), $2.50/$15 (>200K) | Jan 2025 |
| 6 | Gemini Flash Latest | `gemini-flash-latest` | Gemini | $0.30/$2.50 | Jan 2025 |
| 7 | Gemini Flash-Lite Latest | `gemini-flash-lite-latest` | Gemini | $0.10/$0.40 | Jan 2025 |
| 8 | Gemini 2.5 Flash | `gemini-2.5-flash` | Gemini | $0.30/$2.50 | Jan 2025 |
| 9 | Gemini 2.5 Flash-Lite | `gemini-2.5-flash-lite` | Gemini | $0.10/$0.40 | Jan 2025 |
| 10 | Gemini 2.0 Flash | `gemini-2.0-flash` | Gemini | $0.10/$0.40 | Aug 2024 |
| 11 | Gemini 2.0 Flash-Lite | `gemini-2.0-flash-lite` | Gemini | $0.075/$0.30 | Aug 2024 |
| 12 | Gemini Robotics-ER 1.5 Preview | `gemini-robotics-er-1.5-preview` | Gemini | N/A | N/A |
| 13 | Gemini 2.5 Flash Native Audio 12-2025 | `gemini-2.5-flash-native-audio-preview-12-2025` | Live/Audio | N/A | N/A |
| 14 | Gemini 2.5 Pro Preview TTS | `gemini-2.5-pro-preview-tts` | Audio | N/A | N/A |
| 15 | Gemini 2.5 Flash Preview TTS | `gemini-2.5-flash-preview-tts` | Audio | $0.50 (noted) | N/A |
| 16 | Imagen 4 | `imagen-4.0-generate-001` | Images | Paid | Unknown |
| 17 | Imagen 4 Ultra | `imagen-4.0-ultra-generate-001` | Images | Paid | Unknown |
| 18 | Imagen 4 Fast | `imagen-4.0-fast-generate-001` | Images | Paid | Unknown |
| 19 | Veo 3.1 | `veo-3.1-generate-preview` | Video | Paid | Unknown |
| 20 | Veo 3.1 Fast | `veo-3.1-fast-generate-preview` | Video | Paid | Unknown |
| 21 | Veo 2 | `veo-2.0-generate-001` | Video | Paid | Unknown |

### Model Picker Dialog
- **Selector**: Click the model button in the right "Run settings" panel
- **Component**: `mat-dialog-container` with `button.content-button` items inside `MS-MODEL-CAROUSEL-ROW`
- **Filter tabs**: All | Featured | Gemini | Live | Images | Video | Audio
- **Each model row shows**: Name, model ID, description, pricing, knowledge cutoff
- **Actions per model**: Star (favorite), Copy model ID, Developer guide link
- **URL param**: `?model={model_id}` selects model on page load

### 2a. Gemini 3 Flash (Text)
- **URL**: `/prompts/new_chat?model=gemini-3-flash-preview`
- **Settings**: Temperature slider (0-2, default 1), Media resolution (Default), Thinking Level (High)
- **Tools**: Structured outputs, Code execution, Function calling, Grounding with Google Search, Browse URL context
- **Input**: Textarea with `placeholder="Start typing a prompt, use alt + enter to append"`
- **Response features**:
  - Thinking output visible as expandable "Thoughts" section (e.g., "Expand to view model thoughts")
  - Thinking is categorized with titles (e.g., "Pinpointing The Model", "Clarifying The Nomenclature")
  - Model response uses Markdown formatting with footnote references [1][2][3]
- **Save options**: Save to Drive (auto), Make a copy, Delete, Raw Mode toggle
- **Get Code**: Opens panel with Python code (google-genai SDK), Colab button, Download button, API Docs link

### 2b. Gemini 3 Pro (Text)
- **URL**: `/prompts/new_chat?model=gemini-3-pro-preview`
- **Settings**: Same as Flash: Temperature (0-2), Media resolution (Default), Thinking Level (High)
- **Tools**: Same toolset as Flash (Structured outputs, Code execution, Function calling, Grounding, URL browsing)
- **Key difference**: More expensive ($2/$12 vs $0.50/$3), positioned as "most intelligent model with SOTA reasoning"
- **Same UI layout** as Flash -- no visible UI differences for text models

### 2c. Nano Banana Pro (Image Generation)
- **URL**: `/prompts/new_chat?model=gemini-3-pro-image-preview`
- **DIFFERENT UI from text models**:
  - **No Thinking Level** dropdown
  - **Aspect ratio** dropdown: `Auto` (values not fully enumerated)
  - **Resolution** dropdown: `1K`
  - **Temperature** slider present
  - **Tools**: Only Grounding with Google Search (no Code execution, no Function calling, no Structured outputs)
- **Input**: Same textarea as text models
- **Zero-state**: Shows 3 example cards with input/output images:
  1. Fashion product collage on corkboard
  2. Orthographic blueprint of a building
  3. Illustrated explainer of fluid dynamics
- **REQUIRES PAID API KEY**: "Nano Banana Pro is only available for paid tier usage"
- **Supports image upload** for editing/reference

### 2d. Veo 3.1 (Video Generation)
- **URL**: `/prompts/new_chat?model=veo-3.1-generate-preview`
- **COMPLETELY DIFFERENT UI**:
  - **Aspect ratio**: Radio buttons `16:9` | `9:16`
  - **Video duration**: Dropdown `8s`
  - **Frame rate**: Dropdown `24 fps`
  - **Output resolution**: Dropdown `720p`
  - **Negative prompt**: Separate textarea for exclusions
  - **Number of results**: Slider (1)
  - **Temperature**: Slider (0-1, not 0-2 like text models)
  - **Note**: "Content from previous turns is not referenced in new requests"
- **Input**: Textarea with `placeholder="Describe your video"`
- **Zero-state**: Shows example video cards with JSON-style prompts
- **REQUIRES PAID API KEY**: "Link a paid API key to access Veo 3.1"

### 2e. TTS Models (Text-to-Speech)
- **URL (Pro)**: `/prompts/new_chat?model=gemini-2.5-pro-preview-tts`
- **URL (Flash)**: `/prompts/new_chat?model=gemini-2.5-flash-preview-tts`
- **COMPLETELY DIFFERENT UI - Podcast/Dialog mode**:
  - **Mode**: Single-speaker / Multi-speaker toggle
  - **Voice settings**: Speaker 1 and Speaker 2 with voice selection (default: Zephyr, Puck)
  - **Style instructions**: Textarea for style (e.g., "Read this in a dramatic whisper")
  - **Dialog inputs**: Separate textareas for Speaker 1 and Speaker 2 dialog
- **Input**: Main text area with `placeholder="Speaker 1: Hello, world!"`
- **Zero-state suggestion cards**: Audio voice assistant, Podcast transcript, Movie scene script
- **No Temperature, no Tools section**

### 2f. Imagen 4 (Dedicated Image Generation)
- **URL**: `/prompts/new_chat?model=imagen-4.0-generate-001`
- **DIFFERENT from Nano Banana Pro**:
  - **Aspect ratio**: Radio buttons `1:1` | `9:16` | `16:9` | `4:3` | `3:4`
  - **Output resolution**: Dropdown `1K`
  - **Number of results**: Slider (1-4, default 1)
  - **No Temperature slider** (unlike Nano Banana Pro which has one)
  - **No Tools** section at all
  - **No System instructions**
- **Input**: Textarea with `placeholder="Describe your image"`
- **Zero-state**: Shows sample prompts for landscape, afternoon tea, etc.
- **REQUIRES PAID API KEY**: "Link a paid API key to access Imagen 4"
- **Imagen 4 Ultra**: Same UI as Imagen 4, same aspect ratios and controls
- **Imagen 4 Fast**: Same UI (not separately tested but same model family)

### 2g. Gemini 2.5 Flash Native Audio (Live/Real-time)
- **URL**: `/prompts/new_chat?model=gemini-2.5-flash-native-audio-preview-12-2025`
- **LIVE/REAL-TIME UI**:
  - **Voice selector**: Dropdown (default: Zephyr)
  - **Media resolution**: Dropdown (`258 tokens / image`)
  - **Turn coverage** and **Proactive audio** settings
  - **Thinking mode** toggle with thinking budget
  - **Affective dialog** option
  - **Webcam** and **Share Screen** buttons for real-time video input
- **Input**: Textarea with `placeholder="Start typing a prompt"`
- **Zero-state**: "Talk to Gemini live" with webcam and screen share options

### 2h. Gemini Robotics-ER 1.5 Preview
- **URL**: `/prompts/new_chat?model=gemini-robotics-er-1.5-preview`
- **Settings**: Temperature, Media resolution (Default), Thinking mode with budget
- **Tools**: Same as text models (Structured outputs, Code execution, Function calling, etc.)
- **Description**: "Enhances robots' abilities to understand and interact with their environment"

### Get Code Dialog (Available for all models)
- **Language**: Python (using `google-genai` SDK)
- **Actions**: Open in Colab, Download, API Docs link
- **Generated code includes**: Model ID, content structure, tools config, thinking config
- **Code uses**: `client.models.generate_content_stream()` for streaming

### Share Dialog (Playground)
- Opens with text: "Get SDK code to chat with Gemini"
- Appears to provide shareable code rather than a shareable URL

### Model Selection Flow
1. Click model button in Run Settings panel (right side)
2. Model picker dialog opens as `mat-dialog-container`
3. Browse tabs: All / Featured / Gemini / Live / Images / Video / Audio
4. Click `button.content-button` on desired model
5. Dialog closes, URL updates with `?model={id}`, settings panel reconfigures

---

## Mission 3: Prompt Gallery Deep Dive

### Gallery Structure
- **URL**: `https://aistudio.google.com/apps?source=showcase`
- **Default filter**: "Featured" tab (auto-redirects to `?showcaseTag=featured`)
- **Filter tabs** (10 categories):
  1. Featured (default)
  2. All apps
  3. Gemini 3
  4. Nano Banana
  5. Games and Visualizations
  6. GenMedia
  7. Multimodal understanding
  8. Tools and MCP
  9. Code gen
  10. Developer quickstarts

### Complete Gallery App List (21 bundled apps found)
| App Name | URL Slug | Model/Tags |
|----------|----------|------------|
| Gemini Slingshot | `gemini_slingshot` | Gemini 3 Flash, Gaming, MediaPipe |
| Function Call Kitchen | `function_call_kitchen` | Gemini 3 Flash, Function calling |
| EchoPaths | `echo_paths` | Gemini 3 Flash |
| Type Motion | `type_motion` | Veo 3.1 Fast, Audio-Video Generation |
| Veo Studio | `veo_studio` | Veo 3.1, API key needed |
| Research Visualization | `research_visualization` | Gemini 3 Pro, Design and typography |
| Lumina Festival | `lumina` | Gemini 3 Pro, Design and typography |
| Aura Quiet Living | `aura_quiet_living` | Gemini 3 Pro, Design and Typography, One Shot |
| Infinite Heroes | `personalized_comics` | Gemini 3 Pro Image, Design and typography |
| InfoGenius | `info_genius` | Gemini 3 Image Pro, World knowledge, Text rendering |
| Product Mockup Visualization | `product_mockup` | Gemini 3 Image Pro, Creative composition |
| Voxel Toy Box | `voxel_toy_box` | Gemini 3 Pro, 3D Building |
| Gemini Runner | `gemini_runner` | Gemini 3 Pro, 3D Games |
| Shader Pilot | `shader_pilot` | Gemini 3 Pro, 3D Games, Tool calling |
| Tempo Strike | `tempo_strike` | Gemini 3 Pro, 3D Games |
| Sky Metropolis | `sky_metropolis` | Gemini 3 Pro, AI-powered Game |
| Synthwave Space | `synthwave_space` | Gemini 3 Pro, 3D Games |
| Image to Voxel Art | `image_to_voxel` | Gemini 3 Pro, 3D Building |
| SVG Generator | `svg_generator` | Gemini 3 Pro |
| Kinetic Shapes | `kinetic_shapes` | Gemini 3 Pro, Physics Simulation |
| Flash UI | `flash_ui` | Gemini 3 Flash |

### App URL Pattern
```
https://aistudio.google.com/apps/bundled/{slug}?showPreview=true&showAssistant=true
```

### What Opens When You Click a Gallery App
Each gallery app opens in a **full app IDE** with three panels:
1. **Left: AI Chat Assistant** - Conversational interface to modify the app
2. **Center: Preview** (sandboxed iframe) - Live running app
3. **Right: Code Editor** (Monaco/VS Code) - Full source code

### App IDE Toolbar Buttons
| Icon | Aria Label | Function |
|------|-----------|----------|
| arrow_split | Copy app | Fork/copy the app to your account |
| download | Download app | Download source code |
| (github icon) | Sync to GitHub | Push code to GitHub repo |
| rocket_launch | Deploy app | Deploy to Google Cloud Run |
| share | Share app | Share via URL |
| key_off | Switch to API Key for your app | Link API key |
| settings | Advanced settings | Model selector, system instructions |
| refresh | Reset the conversation | Clear chat history |
| draw | Annotate app | Draw on the preview (disabled on bundled apps) |

### App IDE Features
- **Chat input**: `placeholder="Make changes, add new features, ask for anything"`
- **Preview tab**: Live sandboxed iframe with device preview selector (phone/tablet/desktop), reload, fullscreen
- **Code tab**: Monaco editor with file navigation
- **Speech-to-text**: Mic button for voice input
- **File upload**: Insert images, audio, video, files into chat

### Template Customization Flow
1. Open gallery app -> Full IDE loads with working app
2. Use chat to request changes ("Make the background blue", "Add a settings menu")
3. AI modifies code in real-time, preview updates
4. Save, Share, Deploy, or Download the customized version

---

## Mission 4: Build/Create App Section

### Build Section Navigation
The Build section (`/apps`) has 4 tabs:
| Tab | URL | Purpose |
|-----|-----|---------|
| Start | `/apps?source=` | App creation prompt interface |
| Gallery | `/apps?source=showcase` | Browse bundled app templates |
| Your apps | `/apps?source=user` | View created/shared apps |
| FAQ | `/apps?source=faq` | Documentation and help |

### Creating an App from Scratch
1. Navigate to `/apps?source=`
2. Enter a prompt describing the app (e.g., "Create a simple weather app")
3. Click **"Build"** button (or press Enter)
4. AI generates the app, creating a **temporary app** at `/apps/temp/{id}?source=&showAssistant=true&showPreview=true`
5. Full IDE opens with:
   - AI chat (showing "Working" spinner during generation)
   - Monaco code editor
   - Preview iframe
   - **Save** button (to persist to Drive)
   - Stop/Previous/Next navigation for generation steps

### Build Page Elements
- **Model selector**: `button:has-text("Model: Gemini 3 Flash Preview")` -- can change the code assistant model
- **Speech-to-text**: Microphone button
- **File upload**: Insert files into prompt
- **"I'm feeling lucky"**: Random app generation button
- **17 template capability cards** (see Mission 1 for full list)

### App Builder Model Selector ("Advanced Settings")
When clicked, shows:
- **Select model for the code assistant**: Default is Gemini 3 Flash Preview
- **System instructions**: Custom instructions for the project
- **System instructions template**: Pre-built options like "React (TypeScript)"
- **Microphone source**: For voice apps

### Template Cards Behavior
Clicking a template card (e.g., "Nano banana powered app") fills the prompt area with a pre-configured description, which can be further customized before clicking Build.

### "I'm Feeling Lucky" Button
Generates a random app without requiring a prompt. Enabled by default.

### Copy App (Fork) Dialog
- **Fields**: Name, Description
- **Actions**: Cancel, Save
- Creates a personal copy in your Google Drive

### Advanced Settings Dialog
```
Select model for the code assistant: [Default (Gemini 3 Flash Preview)]
System instructions: [Add custom instructions for your project]
System instructions template: [React (TypeScript)]
Microphone source: [No microphones found]
```

---

## Mission 5: Prompt Modes (Structured, Freeform, Batch)

### Available Modes
| Mode | URL | Status |
|------|-----|--------|
| Chat | `/prompts/new_chat` | ACTIVE - Primary mode |
| Freeform | `/prompts/new_freeform` | RESTRICTED - Redirects to `/prompt-access-restricted` |
| Structured | `/prompts/new_structured` | RESTRICTED - Redirects to `/prompt-access-restricted` |
| Batch | `/prompts/new_batch` | RESTRICTED - Redirects to `/prompt-access-restricted` |

### Key Finding
Only the **Chat mode** is currently available. The previous freeform, structured, and batch modes appear to have been deprecated or restricted. The UI has been consolidated into:
1. **Playground** (chat-based prompt interaction)
2. **Build** (app creation via chat-based AI assistant)

### Advanced Settings in Playground
The expandable "Advanced settings" section in the run panel contains:
- **Add stop sequence**: Define stop tokens
- **Output length**: Control response length
- **Top P**: Nucleus sampling parameter

These are the only additional tuning parameters beyond the main Temperature/Thinking Level controls.

---

## Mission 6: Apps Publish/Share

### Share Dialog (Apps)
- **URL**: Clicking "Share app" on any app
- **Content**: `Share "{App Name}"`
- **Shareable URL format**: `https://ai.studio/apps/bundled/{slug}`
- **Copy button**: Copies URL to clipboard
- **Privacy**: Default to fullscreen view

### Your Apps Page
- **URL**: `/apps?source=user`
- **Tabs**:
  - "Created by you" - Apps you've built and saved
  - "Created by others" - Apps shared with you
  - "Recently viewed" - Gallery apps you've opened (appears as separate section)
- **Empty state**: Shows "Explore the gallery" and "Create a new app" buttons
- **Recently viewed apps** show as cards with last-viewed timestamp

### App Storage
- Apps are stored in **Google Drive**
- Inherit Google Drive permission model
- By default apps are **private**
- Can be shared with specific people or made public via Drive sharing
- Search capability within your apps

---

## Mission 7: API Deployment Options

### Deploy to Cloud Run
- **Trigger**: Click "Deploy app" (rocket_launch icon) button in app IDE
- **Dialog**: "Deploy app on Google Cloud"
- **Description**: "Deploy your app as a Cloud Run Service. The app will be accessible via a public URL. Your API key will not be exposed in the app, but will be used by the application."
- **Required**: Select a Google Cloud project
- **UI**: Cloud Project dropdown selector + "Deploy app" button (disabled until project selected)
- **Result**: App gets a public Cloud Run URL with proxy server for API key security

### Get Code (Playground)
- **Trigger**: Click "Get code" button in Playground
- **Output**: Python code using `google-genai` SDK
- **Actions**:
  - **Open in Colab**: Opens Google Colab notebook
  - **Download**: Downloads Python script
  - **API Docs**: Links to `https://ai.google.dev/gemini-api/docs#python`
- **Code includes**: Model ID, content structure, tools config, thinking config, streaming setup

### Generated Code Structure (Python)
```python
from google import genai
from google.genai import types

def generate():
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    model = "gemini-3-flash-preview"
    contents = [types.Content(role="user", parts=[types.Part.from_text(text="...")])]
    tools = [types.Tool(googleSearch=types.GoogleSearch())]
    config = types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_level="HIGH"),
        tools=tools,
    )
    for chunk in client.models.generate_content_stream(
        model=model, contents=contents, config=config
    ):
        print(chunk.text, end="")
```

### GitHub Integration
- **Trigger**: Click GitHub sync button in app IDE
- **Capabilities**: Create repository, commit latest changes
- **Limitations**: Does not support pulling remote changes
- **Stored as**: Standard web app code (index.html with import maps)

### Download App
- **Trigger**: Click download button in app IDE
- **Result**: Downloads app source code directly

### API Keys Management
- **URL**: `/api-keys`
- **Dashboard sub-nav**: API keys | Projects | Usage and Billing | Logs and Datasets | Changelog
- **Features**:
  - Create API key
  - View keys grouped by API key or Project
  - Filter by project
  - Shows: Key (masked), Project name, Created date, Quota tier
  - Copy key, view usage chart, more options
  - Import projects from Google Cloud
- **Current account state**: 1 API key for "Tets Proj" (gen-lang-client-0649028966), Tier 1, created Jan 2, 2026

---

## Mission 8: Category Cards and Specialized Creation Flows

### Category Card System
The Playground page (`/prompts/new_chat`) shows 6 category cards in the zero-state (before any prompt is sent). Each card acts as a **model group navigator**.

### Card Details

| # | Icon | Label | Description | Models Revealed |
|---|------|-------|-------------|----------------|
| 1 | star | Featured | Our top picks including Gemini 3 Pro and Nano Banana Pro | Gemini 3 Pro Preview, Nano Banana Pro, Gemini 3 Flash Preview |
| 2 | chat_bubble | Code, Reasoning, and Chat | Build chatbots, agents, and code with Gemini 3 Pro and Gemini 3 Flash | Gemini 3 Pro Preview, Nano Banana Pro, Gemini 3 Flash Preview |
| 3 | image | Image Generation | Create and edit images with Nano Banana and Imagen | Nano Banana Pro, Nano Banana, Imagen 4 |
| 4 | movie | Video Generation | Generate videos with Veo models, our state of the art video generation models | Veo 3.1, Veo 3.1 Fast, Veo 2 |
| 5 | mic | Text to Speech | Convert text to speech with lifelike realism using Gemini TTS | Gemini 2.5 Pro Preview TTS, Gemini 2.5 Flash Preview TTS |
| 6 | bolt | Real-time | Real-time voice and video with Gemini Live | Gemini 2.5 Flash Native Audio Preview 12-2025 |

### Category Card Flow
1. Click a category card (e.g., "Image Generation")
2. Card expands to show **sub-model list** with descriptions
3. "arrow_back" header shows category name and description
4. Click a specific model from the sub-list
5. URL updates to `?model={model_id}`
6. Settings panel reconfigures with model-specific controls
7. Category cards disappear, replaced by chat input

### Model UI Families
Based on testing, there are **5 distinct UI configurations**:

| UI Type | Models | Key Controls |
|---------|--------|-------------|
| **Text/Chat** | Gemini 3 Pro, Gemini 3 Flash, Gemini 2.5 Pro, Gemini 2.5 Flash, Flash-Lite, Gemini 2.0 Flash, Robotics-ER | Temperature (0-2), Media resolution, Thinking Level, Tools (5), System instructions, Advanced settings |
| **Image (Gemini)** | Nano Banana Pro, Nano Banana | Temperature, Aspect ratio (Auto), Resolution (1K), Grounding only |
| **Image (Imagen)** | Imagen 4, Imagen 4 Ultra, Imagen 4 Fast | Aspect ratio (1:1/9:16/16:9/4:3/3:4), Resolution (1K), Number of results (1-4), NO temperature, NO tools |
| **Video** | Veo 3.1, Veo 3.1 Fast, Veo 2 | Aspect ratio (16:9/9:16), Video duration (8s), Frame rate (24fps), Output resolution (720p), Negative prompt, Number of results, Temperature (0-1) |
| **TTS/Audio** | Gemini 2.5 Pro TTS, Gemini 2.5 Flash TTS | Mode (single/multi-speaker), Voice selector (Zephyr/Puck), Style instructions, Speaker dialog inputs |
| **Live/Real-time** | Gemini 2.5 Flash Native Audio | Voice selector, Media resolution (tokens), Turn coverage, Proactive audio, Thinking mode, Affective dialog, Webcam, Screen share |

---

## Appendix: Key Selectors Reference

### Navigation
| Element | Selector |
|---------|----------|
| Toggle sidebar | `button[aria-label="Toggle navigation menu"]` |
| Home link | `a[href="/"]` with text "Home" |
| Playground link | `a[href="/prompts/new_chat"]` |
| Build link | `a[href="/apps"]` |
| Dashboard link | `a[href="/api-keys"]` |
| Settings button | `button:has-text("Settings")` |

### Playground
| Element | Selector |
|---------|----------|
| Chat input | `textarea[aria-label="Enter a prompt"]` |
| Run button | `button:has-text("Run")` |
| Get Code button | `button:has-text("Get code")` |
| Model selector (right panel) | `button:has-text("gemini-")` in settings area |
| Share button | `button[aria-label="Share prompt"]` |
| More actions | `button[aria-label="View more actions"]` |
| New chat | `button[aria-label="New chat"]` |
| Incognito toggle | `button[aria-label="Temporary chat toggle"]` |
| Thinking Level | `mat-select[aria-label="Thinking Level"]` |
| Media resolution | `mat-select[aria-label="Media resolution"]` |
| System instructions | `button[aria-label="System instructions"]` |
| Tools expand | `button[aria-label="Expand or collapse tools"]` |
| Advanced settings expand | `button[aria-label="Expand or collapse advanced settings"]` |
| Category cards | `button:has-text("FeaturedOur top picks")`, etc. |

### Model Picker Dialog
| Element | Selector |
|---------|----------|
| Model row | `button.content-button` inside `.cdk-overlay-container` |
| Tab buttons | `.cdk-overlay-container button` with text "All"/"Featured"/"Gemini"/etc. |
| Close dialog | `button[aria-label="Close panel"]` |
| Star model | `button[aria-label="Star model"]` |
| Copy model ID | `button[aria-label="Copy to clipboard"]` |

### Build (App IDE)
| Element | Selector |
|---------|----------|
| Chat input | `textarea[placeholder="Make changes, add new features, ask for anything"]` |
| Preview tab | `button:has-text("Preview")` |
| Code tab | `button:has-text("Code")` |
| Save app | `button[aria-label="Save app"]` |
| Download app | `button[aria-label="Download app"]` |
| Deploy app | `button[aria-label="Deploy app"]` |
| Share app | `button[aria-label="Share app"]` |
| GitHub sync | `button[aria-label="Sync to GitHub"]` |
| Copy/Fork app | `button[aria-label="Copy app"]` |
| Advanced settings | `button[aria-label="Advanced settings"]` |
| Reset conversation | `button[aria-label="Reset the conversation"]` |
| Annotate | `button[aria-label="Annotate app"]` |
| Device preview | `button[aria-label="Select device preview"]` |
| Reload preview | `button[aria-label="Reload the app"]` |
| Fullscreen | `button[aria-label="Full screen"]` |
| Back to start | `a:has-text("Back to start")` |

### Build Start Page
| Element | Selector |
|---------|----------|
| Build prompt input | `textarea` on `/apps?source=` |
| Build button | `button:has-text("Build")` |
| Lucky button | `button:has-text("feeling lucky")` |
| Model selector | `button:has-text("Model:")` |
| Template cards | Horizontal scroll button cards |
| Gallery link | `a[href="/apps?source=showcase"]` |

### Video Model (Veo)
| Element | Selector |
|---------|----------|
| Video prompt | `textarea[aria-label="Enter a prompt to generate a video"]` |
| Negative prompt | `textarea[aria-label="Add a negative prompt..."]` |

### TTS Model
| Element | Selector |
|---------|----------|
| Style instructions | `textarea[aria-label="Style instructions"]` |
| Speaker 1 dialog | `textarea[aria-label="Speaker 1 dialog"]` |
| Speaker 2 dialog | `textarea[aria-label="Speaker 2 dialog"]` |

### Image Model (Imagen)
| Element | Selector |
|---------|----------|
| Image prompt | `textarea[aria-label="Enter a prompt to generate an image"]` |

---

## Appendix: Key Facts and Limitations

1. **Paid API key required** for: Nano Banana Pro, all Imagen models, all Veo models
2. **Free tier works** for: Gemini 3 Flash, Gemini 3 Pro (with lower quota), Gemini 2.5 Flash
3. **Apps run client-side** in sandboxed iframes -- no server component
4. **Deploy to Cloud Run** gives public URL with API key proxy
5. **GitHub integration** supports create repo and commit (no pull)
6. **No local dev** -- apps must be built in AI Studio
7. **Package management** via import maps in index.html, served by esm.sh
8. **No Next.js/Svelte/Vue/Astro** -- limited compiler plugin support
9. **Freeform/Structured/Batch** prompt modes are all restricted/deprecated
10. **Google Drive storage** for all apps with inherited permissions
11. **Framework**: React (TypeScript) is the default system instruction template
12. **21 models** available across 7 categories (All, Featured, Gemini, Live, Images, Video, Audio)
