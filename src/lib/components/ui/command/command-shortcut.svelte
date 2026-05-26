<script>
	import { cn } from "$lib/utils.js";
	let {
		ref = $bindable(null),
		class: className,
		keys = '',
		children,
		...restProps
	} = $props();

	const keyChars = $derived(keys ? [...keys] : []);
</script>

{#if keyChars.length > 0}
	<span
		bind:this={ref}
		data-slot="command-shortcut"
		class={cn("ml-auto shrink-0 flex items-center gap-[3px] pl-2", className)}
		{...restProps}
	>
		{#each keyChars as key}
			<kbd class="flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-border/70 bg-muted/60 px-[3px] font-sans text-[10px] leading-none text-muted-foreground shadow-[0_1px_0_hsl(var(--border)/0.6)] group-data-[selected]/command-item:border-accent-foreground/25 group-data-[selected]/command-item:bg-accent-foreground/10 group-data-[selected]/command-item:text-accent-foreground group-data-[selected]/command-item:shadow-none">
				{key}
			</kbd>
		{/each}
	</span>
{:else}
	<span
		bind:this={ref}
		data-slot="command-shortcut"
		class={cn("ml-auto shrink-0 pl-2 font-mono text-ui-xs tabular-nums text-muted-foreground group-data-[selected]/command-item:text-accent-foreground", className)}
		{...restProps}
	>
		{@render children?.()}
	</span>
{/if}
