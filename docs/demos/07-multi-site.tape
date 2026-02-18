# PingOS Demo: Multi-site — One gateway, every website
Output ../assets/07-multi-site.gif
Output ../recordings/07-multi-site.mp4

Set Shell "bash"
Set FontSize 20
Set Width 1400
Set Height 800
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 40ms

Type "# PingOS — One gateway, every website"
Enter
Sleep 1s

Type "# Reddit posts:"
Enter
Type `curl -s -X POST http://localhost:3500/v1/dev/chrome-726391569/extract -H "Content-Type: application/json" -d '{"query":"top 3 posts"}' | jq '.result.data[:2]'`
Enter
Sleep 3s

Type ""
Enter
Type "# Amazon products:"
Enter
Type `curl -s -X POST http://localhost:3500/v1/app/amazon/search -H "Content-Type: application/json" -d '{"query":"usb c cable"}' | jq '.products[:2] | .[].title[:50]'`
Enter
Sleep 4s

Type ""
Enter
Type "# Gmail subjects:"
Enter
Type `curl -s -X POST http://localhost:3500/v1/dev/chrome-726391566/read -H "Content-Type: application/json" -d '{"selector":"span.bog","limit":2}' | jq '.result[:2]'`
Enter
Sleep 3s

Type ""
Enter
Type "# 3 sites, 3 API calls, < 5 seconds total ⚡"
Enter
Sleep 2s
