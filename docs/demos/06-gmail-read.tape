# PingOS Demo: Read — Extract from authenticated pages
Output ../assets/06-gmail-read.gif
Output ../recordings/06-gmail-read.mp4

Set Shell "bash"
Set FontSize 20
Set Width 1400
Set Height 800
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 40ms

Type "# PingOS Read — Works with your real authenticated sessions"
Enter
Sleep 1s

Type `curl -s -X POST http://localhost:3500/v1/dev/chrome-726391566/read \`
Enter
Type `  -H "Content-Type: application/json" \`
Enter
Type `  -d '{"selector": "span.bog", "limit": 5}' | jq .`
Enter
Sleep 4s

Type ""
Enter
Type "# Real Gmail subjects — your browser session, your auth 🔐"
Enter
Sleep 2s
