# Before the Frost

A 3D sparrow migration game. You start as one sparrow with the first frost on its way. Fly from oak to oak,
work out which bird in each roosting flock is the alpha, befriend it, and its flock joins yours. Keep everyone
fed and together, then lead them south across the river before the clock runs out.

**Play it online: https://partofaplan.github.io/migration/**

## Run it locally

No install, no build, no internet connection needed.

- **Mac:** double-click `index.html` (or `open index.html` in Terminal).
- **Windows:** double-click `index.html` (or `start index.html` in a terminal).

It opens in your default browser. Any current Chrome, Edge, Firefox or Safari works; WebGL must be enabled.

## Host it on the web

The game is a plain static site: `index.html` plus the `css/`, `js/` and `vendor/` folders. There is no build step
and no server code, and every path is relative, so it works from a domain root or from a sub-folder.
Upload those files to any static host and it is live.

**GitHub Pages** (free for public repositories):

1. Commit and push to GitHub.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save.
4. After a minute or so the game is at `https://<your-username>.github.io/<repository-name>/`.

The empty `.nojekyll` file tells Pages to serve the files as they are. Each later push to `main` redeploys.

**Other hosts.** Netlify, Cloudflare Pages, Vercel, an S3 bucket or any web server work the same way:
point them at the repository root with no build command, or drag the folder into Netlify Drop.

Visitors need a keyboard. On phones and tablets the title screen says so.

## Controls

| Key | Action |
| --- | --- |
| `A` `D` / `←` `→` | Turn |
| `W` `S` / `↑` `↓` | Climb / dive |
| `Space` | Sprint (burns food faster) |
| `E` | Chirp: perch at an oak, forage at food, call back a wanderer |
| `P` / `Esc` | Pause |
| `M` | Mute |

While perched: `A` `D` choose a bird, `E` befriend it, `Q` fly off. You can also click a bird.

## How it plays

- **Roost oaks** are marked by golden beams and by gold dots on the map. Each holds 3–6 sparrows, one of them the alpha.
- **Finding the alpha.** Each flock gives itself away differently, and a field note tells you what to watch for:
  the highest perch, the biggest black bib, who sings first, or who everyone keeps glancing at.
  Pick the alpha and the whole flock follows you. A wrong pick costs six seconds; two wrong picks and the flock scatters.
- **Food.** The bigger the flock, the faster it eats. Forage at berry bushes and sunflower patches. At zero food,
  sparrows desert you one at a time.
- **Distractions.** Now and then a sparrow peels away after a butterfly or a bottle cap. Fly close and chirp
  within about fifteen seconds or it is gone.
- **Hawks.** A hawk that spots your flock will dive on it. Get low under any tree, or sprint clear.
  Perching and foraging count as cover.
- **Flying south.** Once the flock reaches the target size, cross the river on the southern edge of the map
  (the sun always sits in the south). Run out of time and winter wins.

Three difficulties set the clock, the flock size you need, and how many hawks patrol.

## Project layout

```
index.html        page, HUD and menus
css/style.css     styling
js/util.js        math helpers, seeded RNG, geometry merging
js/audio.js       synthesised sound (WebAudio, no asset files)
js/birds.js       low-poly bird models and wing animation
js/world.js       procedural terrain, oaks and their flocks, food, scenery
js/game.js        game loop, flight, flock, encounters, hawks, HUD
vendor/           Three.js r149 (MIT), bundled so the game runs offline
```

Every world is generated from a random seed, so each game lays out differently.
