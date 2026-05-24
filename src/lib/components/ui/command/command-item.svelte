<script>
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import CheckIcon from '@lucide/svelte/icons/check';

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
		"group/command-item relative flex w-full min-w-0 cursor-default items-center gap-2.5 rounded-md py-2 text-sm outline-hidden select-none",
		"text-foreground data-selected:bg-accent data-selected:text-accent-foreground",
		"data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
		"[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		"[&>[data-slot=command-label]]:min-w-0 [&>[data-slot=command-label]]:flex-1 [&>[data-slot=command-label]]:truncate",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
	<CheckIcon
		class="cn-command-item-indicator pointer-events-none absolute right-0 top-1/2 size-4 -translate-y-1/2 opacity-0 group-has-[[data-slot=command-shortcut]]/command-item:hidden group-has-[[data-slot=command-trailing]]/command-item:hidden group-data-[selected]/command-item:opacity-100"
	/>
</CommandPrimitive.Item>
