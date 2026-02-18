# PingOS Demo: Extract — Pull structured data with natural language
Output ../assets/03-extract.gif
Output ../recordings/03-extract.mp4

Set Shell "bash"
Set FontSize 20
Set Width 1400
Set Height 800
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 40ms

Type "# PingOS Extract — Ask for data in plain English"
Enter
Sleep 1s

Type `curl -s -X POST http://localhost:3500/v1/dev/chrome-726391569/extract \`
Enter
Type `  -H "Content-Type: application/json" \`
Enter
Type `  -d '{"query": "top 5 post titles"}' | jq .`
Enter
Sleep 4s

Type ""
Enter
Type "# Structured data from Reddit, no scraping code needed 🧠"
Enter
Sleep 2s
