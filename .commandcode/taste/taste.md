# css
- Use Tailwind CSS classes for all styling, avoid raw CSS. Confidence: 0.85
- Use Geist font family (by Vercel) as the primary font. Confidence: 0.75

# svelte
- Use shadcn-svelte components for UI elements (dropdowns, context menus, dialogs, buttons). Confidence: 0.80
- Use Svelte 5 runes ($state, $derived, $bindable, $effect) for reactivity. Confidence: 0.70
- Use Monaco Editor (via Svelte wrapper) for SQL editing with font size 16px. Confidence: 0.75
- Use TanStack Hotkeys (@tanstack/svelte-hotkeys) for keyboard shortcut management. Confidence: 0.70
- Use $state.snapshot() to serialize Svelte 5 $state Proxy objects before IndexedDB storage (structuredClone fails on Proxies). Confidence: 0.70

# postgresql
- Use pg_catalog (not information_schema) for PostgreSQL metadata queries such as foreign key detection. Confidence: 0.75

# persistence
- Use IndexedDB via the idb package for client-side data persistence. Confidence: 0.70

# tauri
- Use @tauri-apps/plugin-opener for opening external URLs instead of window.open. Confidence: 0.70
- Disable native browser right-click menu; use custom shadcn context menus instead. Confidence: 0.70

# workflow
- When /guidelines skill is attached: state assumptions explicitly, keep changes minimal and surgical, match existing code style, define success criteria before implementing. Confidence: 0.80
