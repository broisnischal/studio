<script>
  import { cn } from '$lib/utils.js'

  let { embedded = false } = $props()

  const messages = [
    'Fetching rows…',
    'Querying the database…',
    'Loading table data…',
    'Running your query…',
    'Scanning indexes…',
    'Joining tables…',
    'Crunching the numbers…',
    'Executing the plan…',
    'Reading from storage…',
    'Almost there…',
    'Talking to Postgres…',
    'Traversing the B-tree…',
  ]

  const message = messages[Math.floor(Math.random() * messages.length)]
</script>

<div
  class={cn(
    'flex w-full items-center justify-center',
    embedded ? 'h-40' : 'min-h-0 flex-1',
  )}
  role="status"
  aria-label="Loading"
>
  <div class="flex flex-col items-center gap-3">
    <span class="inline-flex gap-1.5" aria-hidden="true">
      <span
        class="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
        style="animation-delay: 0ms"
      ></span>
      <span
        class="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
        style="animation-delay: 150ms"
      ></span>
      <span
        class="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
        style="animation-delay: 300ms"
      ></span>
    </span>
    <p class="font-mono text-ui-sm text-muted-foreground">{message}</p>
  </div>
</div>
