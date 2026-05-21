<script>
	import { Toaster as Sonner } from 'svelte-sonner'
	import { mode } from 'mode-watcher'

	let { ...restProps } = $props()

	const toastOptions = {
		unstyled: true,
		classes: {
			toast:
				'group toast pointer-events-auto relative flex w-full items-start gap-3 rounded-lg border border-border bg-popover px-3.5 py-3 text-popover-foreground shadow-lg ring-1 ring-foreground/5',
			title: 'text-sm font-medium leading-snug tracking-tight text-foreground',
			description: 'text-sm leading-snug text-muted-foreground',
			content: 'flex min-w-0 flex-1 flex-col gap-0.5',
			actionButton:
				'ml-auto shrink-0 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted',
			cancelButton:
				'ml-auto shrink-0 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted',
			success:
				'border-emerald-500/35 bg-emerald-500/[0.07] dark:border-emerald-400/30 dark:bg-emerald-400/[0.08]',
			error:
				'border-destructive/40 bg-destructive/[0.07] dark:border-destructive/35 dark:bg-destructive/[0.09]',
			warning:
				'border-amber-500/35 bg-amber-500/[0.07] dark:border-amber-400/30 dark:bg-amber-400/[0.08]',
			info: 'border-border bg-popover',
		},
	}
</script>

<Sonner
	theme={mode.current}
	class="toaster group"
	toastOptions={toastOptions}
	successIcon={null}
	errorIcon={null}
	warningIcon={null}
	infoIcon={null}
	loadingIcon={null}
	closeIcon={null}
	gap={10}
	duration={4000}
	style="--width: min(22rem, calc(100vw - 2rem)); --border-radius: var(--radius); font-family: var(--font-sans); font-size: var(--app-font-size);"
	{...restProps}
/>
