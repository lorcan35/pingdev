# PingOS Demo Index

> All demos recorded with [VHS](https://github.com/charmbracelet/vhs) + ffmpeg x11grab.  
> GIFs are optimized with gifsicle. Split-screen recordings capture the full desktop.

---

## Terminal Demos (VHS Tapes)

| # | Demo | Description | What It Shows |
|---|------|-------------|---------------|
| 01 | [Health & Devices](assets/01-health-and-devices.gif) | Gateway health check + device discovery | `/v1/health` and `/v1/devices` — see every connected browser tab |
| 02 | [Recon](assets/02-recon.gif) | Understand any page instantly | `/v1/dev/{id}/recon` — page title, URL, action count, structure |
| 03 | [Extract](assets/03-extract.gif) | Pull structured data with natural language | `/v1/dev/{id}/extract` — "top 5 post titles" from Reddit |
| 04 | [Amazon Search](assets/04-amazon-search.gif) | E-commerce API in one call | `/v1/app/amazon/search` — products with prices, ratings, links |
| 05 | [Act](assets/05-act.gif) | Control browser with natural language | `/v1/dev/{id}/act` — "click the search button" |
| 06 | [Gmail Read](assets/06-gmail-read.gif) | Extract from authenticated pages | `/v1/dev/{id}/read` — real Gmail subjects from your session |
| 07 | [Multi-Site](assets/07-multi-site.gif) | One gateway, every website | Reddit + Amazon + Gmail in 3 rapid-fire API calls |

### GIF Previews

#### 01 — Health & Devices
![Health & Devices](assets/01-health-and-devices.gif)

#### 02 — Recon
![Recon](assets/02-recon.gif)

#### 03 — Extract
![Extract](assets/03-extract.gif)

#### 04 — Amazon Search
![Amazon Search](assets/04-amazon-search.gif)

#### 05 — Act
![Act](assets/05-act.gif)

#### 06 — Gmail Read
![Gmail Read](assets/06-gmail-read.gif)

#### 07 — Multi-Site
![Multi-Site](assets/07-multi-site.gif)

---

## Split-Screen Recordings (Browser + Terminal)

These show the full desktop with Chrome on the left and terminal on the right:

| Demo | Description | File |
|------|-------------|------|
| Amazon Search | Navigate to Amazon tab, run search API, see results | [split-amazon-search.mp4](recordings/split-amazon-search.mp4) |
| YouTube Act | Send act instruction, watch browser respond | [split-youtube-act.mp4](recordings/split-youtube-act.mp4) |
| Multi-Site Rapid Fire | Reddit → Amazon → Gmail in sequence | [split-multi-site.mp4](recordings/split-multi-site.mp4) |

---

## Re-Recording

### Prerequisites
```bash
# VHS (terminal recording)
go install github.com/charmbracelet/vhs@latest

# ffmpeg (video encoding + screen capture)
brew install ffmpeg

# gifsicle (GIF optimization)
brew install gifsicle
```

### Record All VHS Tapes
```bash
cd docs/demos
./record-all.sh
```

### Record a Single Tape
```bash
cd docs/demos
~/go/bin/vhs 04-amazon-search.tape
gifsicle -O3 --lossy=80 ../assets/04-amazon-search.gif -o ../assets/04-amazon-search.gif
```

### Record Split-Screen Demos
Requires a running X11 display with Chrome and terminal positioned:
```bash
# Position windows: Chrome left half, terminal right half
wmctrl -i -r $CHROME_WIN -e 0,0,0,960,1080
wmctrl -i -r $TERM_WIN -e 0,960,0,960,1080

# Record 15-second screen capture
DISPLAY=:1 ffmpeg -y -f x11grab -framerate 30 -video_size 1920x1080 \
  -i :1 -t 15 -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p \
  docs/recordings/my-demo.mp4
```

### Device IDs
Update tape files if Chrome tab IDs change:
```
YouTube:  chrome-726391565
Gmail:    chrome-726391566
Amazon:   chrome-726391567
GitHub:   chrome-726391568
Reddit:   chrome-726391569
Calendar: chrome-726391570
Sheets:   chrome-726391571
Claude:   chrome-726391572
```

Check current IDs: `curl -s http://localhost:3500/v1/devices | jq '.extension.clients[].tabs[] | {id: .deviceId, title: .title}'`
