# Japanese Minimal artwork

Opt-in appearance; Forest trail remains the default. Images are static app assets, with no runtime generation or added service costs.

All URLs are defined in `lib/appearance-art.ts`. To replace artwork, add a versioned WebP file here and update that mapping (including thumbnail if needed). No workout records, migrations, account preferences, or layout edits are required. Keep the preset ID `japanese` stable.

- morning / afternoon / evening / night: standalone landscape prints. Current image slot crops with object-fit: cover; keep essential subjects away from edges and test narrow phones. Recommended 3:2, 1600px wide, under 400 KB. No text or interface elements.
- background: mostly blank ivory with faint independent landscape at bottom left. Never continue a branch or path into a workout image.
- journey: decorative background only. The actual route, week ticks, phase numbers, finish flag and runner are rendered from data above it. Never bake progress into the picture.
- thumbnail: small preview of the selected visual direction.

Natsuki's individual-workout illustration feedback is deferred; these first images can be swapped independently later.

Initial artwork generated with the built-in image tool: sparse Japanese sumi ink pine, winding trail and gray hills on warm ivory washi paper. Morning: low vermilion sunrise and mist; afternoon: high small sun and clear sky; evening: setting sun and gray dusk; night: ivory moon and charcoal sky. Background: blank ivory with faint lower-left hills. Journey: sparse ink hills/pines without any route or labels.

## Daytime revision 2

The approved night scene is the reference for all three daytime edits: keep the pine, mountain ridgelines, rocks and trail composition consistent; only sky/light/mist changes. Daytime v2 uses soft dawn mist, desaturated clear afternoon, and dusty rose dusk. Night remains unchanged. Compare all four together before approving any replacement to avoid scenery jumping between periods.

Time labels are real text rendered by TodayWorkout from PERIOD_LABELS and the same period that selects the image, including Night. Never bake labels into replacement images. The editor already labels every period. Current daytime/thumbnail URLs are versioned in the central mapping to avoid stale cached assets. Old images are retained for reference.
