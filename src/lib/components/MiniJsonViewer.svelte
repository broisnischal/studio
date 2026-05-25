<script>
  import { tick } from "svelte";
  import Copy from "@lucide/svelte/icons/copy";
  import { toast } from "svelte-sonner";
  import { appThemeId } from "$lib/stores/settings.js";
  import { highlightCode } from "$lib/shiki-highlighter.js";
  import { formatJsonValue } from "$lib/row-inspector.js";
  import { valueForJsonViewer } from "$lib/cell-expand.js";
  import { linkifyJsonInElement } from "$lib/json-inspector.js";
  import { cn } from "$lib/utils.js";

  let {
    value,
    /** Max height before scrolling (CSS length) */
    maxHeight = "min(40vh, 14rem)",
    class: className = "",
  } = $props();

  let html = $state("");
  let loading = $state(false);
  /** @type {HTMLDivElement | null} */
  let rootEl = $state(null);

  const jsonText = $derived(formatJsonValue(valueForJsonViewer(value)));
  const appTheme = $derived($appThemeId);

  $effect(() => {
    const source = jsonText;
    const theme = appTheme;
    let cancelled = false;
    loading = true;
    highlightCode(source, "json", theme)
      .then((result) => {
        if (!cancelled) html = result;
      })
      .catch(() => {
        if (!cancelled) {
          html = `<pre class="m-0 max-w-full p-0 font-mono text-ui-2xs leading-relaxed whitespace-pre text-foreground">${escapeHtml(source)}</pre>`;
        }
      })
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    if (!html || !rootEl) return;
    const source = jsonText;
    void tick().then(() => {
      const pre = rootEl?.querySelector("pre");
      if (pre instanceof HTMLElement) linkifyJsonInElement(pre, source);
    });
  });

  /** @param {string} s */
  function escapeHtml(s) {
    return s
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(jsonText);
      toast.success("Copied JSON");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }
</script>

<div
  class={cn(
    "mini-json-viewer group/mini relative isolate w-full min-w-0 max-w-[50vw] overflow-hidden rounded-md border border-border/70 bg-[var(--editor-surface)] shadow-sm",
    className,
  )}
>
  <button
    type="button"
    class="absolute top-1.5 left-1.5 z-10 inline-flex size-6 items-center justify-center rounded-md border border-transparent bg-background/80 text-muted-foreground opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:border-border hover:text-foreground group-hover/mini:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    title="Copy JSON"
    onclick={copyJson}
  >
    <Copy class="size-3" />
  </button>
  <div
    bind:this={rootEl}
    data-studio-selectable="text"
    class="app-scroll max-w-full overflow-x-auto overflow-y-auto px-2.5 py-2 pr-9"
    style:max-height={maxHeight}
  >
    {#if loading && !html}
      <p class="font-mono text-ui-2xs text-muted-foreground">Loading…</p>
    {:else}
      <div
        class="mini-json-shiki min-w-0 max-w-full [&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:font-mono [&_pre]:text-ui-2xs [&_pre]:leading-relaxed [&_pre]:whitespace-pre [&_.json-inspector-url]:text-link [&_.json-inspector-url]:underline [&_.json-inspector-url]:underline-offset-2"
      >
        {@html html}
      </div>
    {/if}
  </div>
</div>
