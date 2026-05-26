<script>
  import CircleCheck from '@lucide/svelte/icons/circle-check'
  import Info from '@lucide/svelte/icons/info'
  import Loader2 from '@lucide/svelte/icons/loader-2'
  import OctagonX from '@lucide/svelte/icons/octagon-x'
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert'
  import X from '@lucide/svelte/icons/x'
  import { Toaster as Sonner } from 'svelte-sonner'
  import { mode } from 'mode-watcher'

  let { ...restProps } = $props()

  const base =
    'group/toast pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-lg border border-border/80 bg-popover px-3.5 py-3 text-popover-foreground shadow-[0_4px_16px_-2px_rgba(0,0,0,0.1),0_1px_4px_-1px_rgba(0,0,0,0.06)] dark:shadow-[0_4px_24px_-2px_rgba(0,0,0,0.55),0_1px_6px_-1px_rgba(0,0,0,0.3)] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-lg'
  const toastOptions = {
    unstyled: true,
    classes: {
      toast: base,
      title: 'text-ui-xs font-semibold leading-snug tracking-tight text-foreground',
      description: 'text-[11px] leading-snug text-muted-foreground',
      content: 'flex min-w-0 flex-1 flex-col gap-[3px]',
      icon: 'm-0 flex shrink-0 items-center self-start pt-px [&_svg]:pointer-events-none',
      actionButton:
        'shrink-0 rounded bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90',
      cancelButton:
        'shrink-0 rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80',
      closeButton:
        '!absolute right-1.5 top-1.5 flex size-[18px] items-center justify-center rounded text-muted-foreground/40 opacity-0 transition-[opacity,background-color,color] hover:bg-accent hover:text-foreground group-hover/toast:opacity-100',
      success: `${base} before:bg-emerald-500`,
      error: `${base} before:bg-destructive`,
      warning: `${base} before:bg-amber-500`,
      info: `${base} before:bg-blue-500`,
    },
  }
</script>

<Sonner
  theme={mode.current}
  class="toaster group"
  toastOptions={toastOptions}
  gap={8}
  duration={4000}
  style="--width: min(22rem, calc(100vw - 1.5rem)); --border-radius: 0.75rem; font-family: var(--font-sans); font-size: var(--app-font-size); --normal-bg: var(--popover); --normal-text: var(--popover-foreground); --normal-border: var(--border);"
  {...restProps}
>
  {#snippet loadingIcon()}
    <span
      class="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      aria-hidden="true"
    >
      <Loader2 class="size-3 animate-spin" />
    </span>
  {/snippet}
  {#snippet successIcon()}
    <span
      class="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-400"
      aria-hidden="true"
    >
      <CircleCheck class="size-3" strokeWidth={2.5} />
    </span>
  {/snippet}
  {#snippet errorIcon()}
    <span
      class="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-destructive/12 text-destructive dark:bg-destructive/20"
      aria-hidden="true"
    >
      <OctagonX class="size-3" strokeWidth={2.5} />
    </span>
  {/snippet}
  {#snippet infoIcon()}
    <span
      class="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-blue-500/12 text-blue-600 dark:bg-blue-400/15 dark:text-blue-400"
      aria-hidden="true"
    >
      <Info class="size-3" strokeWidth={2.5} />
    </span>
  {/snippet}
  {#snippet warningIcon()}
    <span
      class="flex size-[22px] shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:bg-amber-400/15 dark:text-amber-400"
      aria-hidden="true"
    >
      <TriangleAlert class="size-3" strokeWidth={2.5} />
    </span>
  {/snippet}
  {#snippet closeIcon()}
    <X class="size-2.5" strokeWidth={2.5} />
  {/snippet}
</Sonner>
