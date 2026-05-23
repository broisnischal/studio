<script>
  import ShikiBlock from './ShikiBlock.svelte'

  let { sql = '', open = true } = $props()
</script>

{#if open}
  <div class="border-t border-border/50 bg-muted/15">
    <ShikiBlock code={sql} lang="sql" embedded />
  </div>
{/if}
