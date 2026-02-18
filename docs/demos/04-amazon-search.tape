# PingOS Demo: Amazon PingApp — E-commerce API in one call
Output ../assets/04-amazon-search.gif
Output ../recordings/04-amazon-search.mp4

Set Shell "bash"
Set FontSize 20
Set Width 1400
Set Height 800
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 40ms

Type "# PingOS App: Amazon — Full e-commerce API"
Enter
Sleep 1s

Type `curl -s -X POST http://localhost:3500/v1/app/amazon/search \`
Enter
Type `  -H "Content-Type: application/json" \`
Enter
Type `  -d '{"query": "nvidia dgx spark"}' \`
Enter
Type `  | jq '.products[:3] | .[] | {title: .title[:60], price, rating}'`
Enter
Sleep 5s

Type ""
Enter
Type "# 20 products with prices, ratings, and links — one API call 🛒"
Enter
Sleep 2s
