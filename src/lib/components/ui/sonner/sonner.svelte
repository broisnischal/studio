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

  const toastSurface =
    'group/toast pointer-events-auto relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-popover/88 px-3.5 py-2.5 text-popover-foreground shadow-[0_10px_38px_-12px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.04)] backdrop-blur-xl backdrop-saturate-150 dark:border-border/50 dark:bg-popover/78 dark:shadow-[0_12px_42px_-14px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)]'

  const toastOptions = {
    unstyled: true,
    classes: {
      toast: toastSurface,
      title: 'text-[13px] font-medium leading-snug tracking-tight text-foreground',
      description: 'text-[13px] leading-snug text-muted-foreground',
      content: 'flex min-w-0 flex-1 flex-col gap-0.5 pr-1',
      icon: 'm-0 flex shrink-0 items-center self-center [&_svg]:pointer-events-none',
      actionButton:
        'shrink-0 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90',
      cancelButton:
        'shrink-0 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/80',
      closeButton:
        '!absolute right-2 top-2 flex size-5 items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-[opacity,background-color,color] hover:bg-muted/80 hover:text-foreground group-hover/toast:opacity-100',
      success: toastSurface,
      error: toastSurface,
      warning: toastSurface,
      info: toastSurface,
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
      class="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground"
      aria-hidden="true"
    >
      <Loader2 class="size-3.5 animate-spin" />
    </span>
  {/snippet}
  {#snippet successIcon()}
    <span
      class="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/14 dark:text-emerald-400"
      aria-hidden="true"
    >
      <CircleCheck class="size-3.5" strokeWidth={2.25} />
    </span>
  {/snippet}
  {#snippet errorIcon()}
    <span
      class="flex size-7 shrink-0 items-center justify-center rounded-full bg-destructive/12 text-destructive dark:bg-destructive/18"
      aria-hidden="true"
    >
      <OctagonX class="size-3.5" strokeWidth={2.25} />
    </span>
  {/snippet}
  {#snippet infoIcon()}
    <span
      class="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-500/12 text-sky-600 dark:bg-sky-400/14 dark:text-sky-400"
      aria-hidden="true"
    >
      <Info class="size-3.5" strokeWidth={2.25} />
    </span>
  {/snippet}
  {#snippet warningIcon()}
    <span
      class="flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-500/12 text-amber-600 dark:bg-amber-400/14 dark:text-amber-400"
      aria-hidden="true"
    >
      <TriangleAlert class="size-3.5" strokeWidth={2.25} />
    </span>
  {/snippet}
  {#snippet closeIcon()}
    <X class="size-3" strokeWidth={2.25} />
  {/snippet}
</Sonner>
