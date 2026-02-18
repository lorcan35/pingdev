# PingOS Demo: Recon — Understand any page instantly
Output ../assets/02-recon.gif
Output ../recordings/02-recon.mp4

Set Shell "bash"
Set FontSize 20
Set Width 1400
Set Height 800
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 40ms

Type "# PingOS Recon — Discover what's on any page"
Enter
Sleep 1s

Type `curl -s -X POST http://localhost:3500/v1/dev/chrome-726391565/recon -H "Content-Type: application/json" -d '{}' | jq '{title: .result.title, url: .result.url, actions: (.result.actions | length), structure: .result.structure}'`
Enter
Sleep 4s

Type ""
Enter
Type "# 49 interactive actions found, page structure mapped ✅"
Enter
Sleep 2s
