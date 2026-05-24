<script>
	import { cn } from "$lib/utils.js";
	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	} = $props();
</script>

<span
	bind:this={ref}
	data-slot="command-shortcut"
	class={cn(
		"ml-auto shrink-0 pl-2 font-mono text-ui-xs tabular-nums text-muted-foreground group-data-[selected]/command-item:text-accent-foreground",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</span>
