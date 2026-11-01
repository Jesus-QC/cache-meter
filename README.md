# cache-meter

A Claude Code mod that adds a **Cache** pane showing whether this conversation's prompt cache is still hot, so you know if your next message reuses it or pays to rebuild it:

- **Hot**, **Cooling** or **Cold**, with a bar of how much of the cache's lifetime is left
- a countdown to when it goes cold ("cold in 42m")
- a status line entry (`cache hot · 42m`) that ticks every minute
- one notification per turn when the cache starts cooling, so you can send something before it expires
- after `/compact`, it shows the cache as cold, since the next request rebuilds it

The pixel Claude crab shows the temperature: red-orange and dancing with flames off its back while hot, fading from orange to icy blue and shivering while cooling, and frozen solid with frost, icicles and falling snow once cold. In a terminal it turns red, yellow or blue, with flames (`▲`) or snow (`✻`) above it.

The countdown restarts at the end of every turn of the main conversation. Subagents have caches of their own and don't count.

## Usage

Run `/cache-meter` to open the pane; it also replies with a small crab and how long the cache has left. The pane fills in after the first reply.

## Setting

Claude Code doesn't tell mods how long the cache lasts, so the mod assumes it. **Cache lifetime** is `1h` by default, what Claude Code normally uses on a Claude subscription. Set it to `5m` if you're on overage or an API key. Change it in the plugin's row of the config menu.

## Install

At the prompt of a terminal Claude Code session:

```
/plugin install cache-meter --marketplace Jesus-QC/cache-meter
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```bash
claude plugin install cache-meter --marketplace Jesus-QC/cache-meter
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `Jesus-QC/cache-meter`, then **Add plugin**.

Works well next to [usage-meter](https://github.com/Jesus-QC/usage-meter), which shows how much of your subscription's limits are left.
