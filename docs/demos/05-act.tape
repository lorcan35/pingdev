# PingOS Demo: Act — Control browser with natural language
Output ../assets/05-act.gif
Output ../recordings/05-act.mp4

Set Shell "bash"
Set FontSize 20
Set Width 1400
Set Height 800
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 40ms

Type "# PingOS Act — Natural language browser control"
Enter
Sleep 1s

Type `curl -s -X POST http://localhost:3500/v1/dev/chrome-726391565/act \`
Enter
Type `  -H "Content-Type: application/json" \`
Enter
Type `  -d '{"instruction": "click the search button"}' | jq .`
Enter
Sleep 4s

Type ""
Enter
Type "# Browser executed the instruction — no selectors needed 🤖"
Enter
Sleep 2s
