# PingOS Demo: Health Check & Device Discovery
Output ../assets/01-health-and-devices.gif
Output ../recordings/01-health-and-devices.mp4

Set Shell "bash"
Set FontSize 20
Set Width 1400
Set Height 800
Set Theme "Dracula"
Set Padding 20
Set TypingSpeed 40ms
Set PlaybackSpeed 1

# Title
Type "# PingOS — Health Check & Device Discovery"
Enter
Sleep 1s

Type "# 1. Check gateway health"
Enter
Sleep 500ms
Type "curl -s http://localhost:3500/v1/health | jq ."
Enter
Sleep 2s

Type ""
Enter
Type "# 2. List connected browser tabs"
Enter
Sleep 500ms
Type `curl -s http://localhost:3500/v1/devices | jq '.extension.clients[].tabs[] | {id: .deviceId, title: .title}'`
Enter
Sleep 3s

Type ""
Enter
Type "# Gateway sees every tab in your browser 🔥"
Enter
Sleep 2s
