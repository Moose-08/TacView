# TACVIEW

A live tactical map for War Thunder that actually looks good.

War Thunder quietly ships a telemetry API on `localhost:8111` while you play.
The stock page is bare-bones, so this turns that data into a proper command
display: a zoomable tactical map with friendly/hostile markers, a threat board
sorted by range, vehicle instruments, a readable battle log, waypoints you can
drop on the map, and an always-on-top overlay you can keep over the game.

Everything runs locally on your machine. Nothing is injected into the game and
nothing touches its memory - it just reads the same HTTP API the game already
exposes. That also means it only sees what the game chooses to show you, so
it's not a wallhack, just a better map.

## Running it

Grab `TACVIEW.exe` from the releases page and run it. It starts a small local
server, opens the app in your browser, and sits in the system tray - no
console window. Right-click the tray icon to open the app, launch the
overlay, or quit. Running the exe again while it's up just reopens the app.
That's the whole install.

If you'd rather run from source you need Node 18 or newer:

    npm start

Then open http://localhost:3111.

To build the exe yourself:

    npm install
    npm run build:exe

which produces `build/TACVIEW.exe` with the web app, overlay, and icon baked
in. The only dependency is rcedit, used at build time to set the icon.

## The overlay

The OVERLAY button opens a small always-on-top window with waypoint steering
(an arrow that points where you need to turn), the nearest threat, and your
speed/alt/heading. The gear button next to it picks which widgets show, plus
opacity, text size, nav and text colors, and a callsign filter for the kill
feed. Changes apply while the overlay is open. There's also a nav popout
option that moves the waypoint steering into its own little window, so you
can park the arrow near your crosshair and keep the rest in a corner - both
windows remember their positions separately.

Two things to know: the game has to run in borderless or windowed mode
(exclusive fullscreen can't be overlaid by anything), and the overlay is a
separate little window you can drag anywhere - its position is remembered.

## Waypoints

Right-click the map to drop a waypoint, shift+right-click for a POI.
Waypoints are consumed when you reach them and the route moves on to the next
one. POIs stick around. Click a row in the panel to pick which one you're
steering to.

## How it works

`server.js` serves the web app and proxies the game's API (the game sends no
CORS headers, so the browser can't call it directly). The frontend polls a few
endpoints - map objects, telemetry, the battle log - and draws everything on a
canvas. The overlay is a WPF window driven by PowerShell that reads the same
API, with waypoint data relayed through the local server.

There's also a browser extension in `extension/` that runs the whole app
without the server (extensions can call the game API directly). Optional -
the exe is the simpler way to use this.

## Notes

- Windows only, since the overlay is WPF.
- The game only exposes telemetry during a match, so the app shows NO SIGNAL
  in the hangar. That's normal.
- If port 3111 is taken, set `PORT` to something else.
