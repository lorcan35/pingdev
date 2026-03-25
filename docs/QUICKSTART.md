# 🚀 PingOS Quickstart (5 Minutes)

PingOS turns any website into an API. No scraping code, no maintenance, just data.

In this 5-minute guide, we will connect PingOS, extract data from a live webpage, and generate your first API wrapper.

## Prerequisites
- Node.js 20+
- Google Chrome

## Step 1: Install & Start

1. **Install PingOS** (Assuming you are in the project folder):
   ```bash
   npm install
   npm run build
   ```

2. **Start the Gateway**:
   ```bash
   pingdev up
   ```
   *This starts the PingOS Gateway on \`localhost:3500\` and launches a managed Chrome browser with the PingOS extension loaded.*

## Step 2: The Magic Connection

PingOS works by bridging a real browser tab into your terminal/API.

1. In the Chrome window that just opened, navigate to any interesting website. For example: **https://news.ycombinator.com/**
2. Click the **PingOS Extension Icon** in the top right.
3. Toggle the switch next to your tab to **Connect** it.
   *(You will see a green "Connected" badge appear)*

## Step 3: Zero-Config Demo

Now that the tab is connected, let PingOS analyze and extract data from it automatically. Open a new terminal and run:

```bash
pingdev demo
```

PingOS will automatically:
1. Detect your connected Hacker News tab.
2. Analyze the visual structure of the page.
3. Extract the top stories, links, and points.
4. Output the structured JSON data right in your terminal.

## Step 4: Create Your Own App

Want to make a dedicated API for this site? Use the Smart App Wizard:

```bash
pingdev init
```

The wizard will guide you through:
1. Entering the URL (e.g., `https://news.ycombinator.com`).
2. Giving PingOS permission to use the connected tab.
3. Automatically generating a full `pingapp.json` file.

You can then serve it as a persistent local API:
```bash
pingdev serve ./pingapp
```

Now you have a local API for Hacker News running instantly!

## Next Steps

- Want to see more complex examples? Check out the [Tutorials](docs/TUTORIAL.md).
- Running into issues? See [Troubleshooting](docs/TROUBLESHOOTING.md).