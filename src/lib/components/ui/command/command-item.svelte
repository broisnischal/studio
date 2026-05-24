<script>
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	} = $props();
</script>

<CommandPrimitive.Item
	bind:ref
	data-slot="command-item"
	class={cn(
		"group/command-item relative flex w-full min-w-0 cursor-default items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm outline-hidden select-none",
		"text-foreground data-selected:bg-accent data-selected:text-accent-foreground",
		"data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
		"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		"[&>[data-slot=command-label]]:min-w-0 [&>[data-slot=command-label]]:flex-1 [&>[data-slot=command-label]]:truncate",
		"[&>[data-slot=command-trailing]]:ml-auto [&>[data-slot=command-trailing]]:shrink-0",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</CommandPrimitive.Item>
