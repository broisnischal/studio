<script>
  import { toast } from 'svelte-sonner'
  import Plus from '@lucide/svelte/icons/plus'
  import CalendarClock from '@lucide/svelte/icons/calendar-clock'
  import Fingerprint from '@lucide/svelte/icons/fingerprint'
  import Hash from '@lucide/svelte/icons/hash'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { cn } from '$lib/utils.js'
  import {
    buildInsertPayload,
    getColumnEnumValues,
    isBooleanType,
    isDateOnlyType,
    isEditableType,
    isLikelyAutoColumn,
    isTimeOnlyType,
  } from '$lib/cell-value.js'
  import {
    columnTimestampRole,
    defaultInsertDraft,
    generateCuid,
    generateUuid,
    nowDateOnly,
    nowDateTimeLocal,
    nowTimeOnly,
    shouldOfferCuidGenerator,
    shouldOfferUuidGenerator,
    shouldUseDateTimePicker,
  } from '$lib/insert-field.js'

  let {
    open = $bindable(false),
    tableLabel = '',
    columns = [],
    primaryKey = [],
    saving = false,
    /** @param {Record<string, unknown>} values */
    oninsert = async () => {},
  } = $props()

  /** @type {Record<string, string>} */
  let drafts = $state({})

  const editableColumns = $derived(
    columns.filter((c) => isEditableType(c.dataType ?? c.data_type ?? '')),
  )

  const fieldClass =
    'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 font-mono text-ui-sm shadow-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'

  function resetDrafts() {
    /** @type {Record<string, string>} */
    const next = {}
    for (const col of editableColumns) {
      next[col.name] = defaultInsertDraft(col, primaryKey)
    }
    drafts = next
  }

  $effect(() => {
    if (open) resetDrafts()
  })

  /** @param {string} name @param {string} value */
  function setDraft(name, value) {
    drafts = { ...drafts, [name]: value }
  }

  async function submit() {
    const built = buildInsertPayload(editableColumns, primaryKey, drafts)
    if (!built.ok) {
      toast.error('Cannot insert row', { description: built.message })
      return
    }
    await oninsert(/** @type {Record<string, unknown>} */ (built.values))
  }

  /** @param {KeyboardEvent} e */
  function onDialogKeydown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!saving && editableColumns.length > 0) void submit()
    }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex max-h-[min(88vh,36rem)] max-w-xl flex-col gap-0 overflow-hidden p-0"
    onkeydown={onDialogKeydown}
  >
    <Dialog.Header class="shrink-0 border-b border-border bg-muted/15 px-5 py-4">
      <div class="flex items-start gap-3">
        <div
          class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-background shadow-sm"
        >
          <Plus class="size-4 text-muted-foreground" />
        </div>
        <div class="min-w-0 flex-1 space-y-1">
          <Dialog.Title class="text-base font-semibold tracking-tight">Insert row</Dialog.Title>
          <Dialog.Description class="text-ui-xs text-muted-foreground">
            {#if tableLabel}
              Into <span class="font-mono text-foreground/90">{tableLabel}</span>
            {:else}
              Add a new record to this table
            {/if}
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="app-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {#if editableColumns.length === 0}
        <p class="text-ui-sm text-muted-foreground">No editable columns in this table.</p>
      {:else}
        <p class="mb-4 text-ui-xs leading-relaxed text-muted-foreground">
          Timestamps default to <span class="text-foreground/80">now</span>. Use
          <span class="font-mono text-foreground/80">NULL</span> in text fields for explicit nulls.
          Leave auto columns empty for database defaults.
        </p>
        <div class="flex flex-col gap-2.5">
          {#each editableColumns as col (col.name)}
            {@const dataType = col.dataType ?? col.data_type ?? 'text'}
            {@const enumValues = getColumnEnumValues(col)}
            {@const auto = isLikelyAutoColumn(dataType, col.name, primaryKey)}
            {@const required = !col.nullable && !auto}
            {@const tsRole = columnTimestampRole(col.name)}
            {@const dateTimePicker = shouldUseDateTimePicker(dataType, col.name)}
            {@const dateOnly = isDateOnlyType(dataType)}
            {@const timeOnly = isTimeOnlyType(dataType)}
            {@const showUuid = shouldOfferUuidGenerator(dataType, col.name, primaryKey)}
            {@const showCuid = shouldOfferCuidGenerator(dataType, col.name, primaryKey)}
            <div
              class={cn(
                'rounded-lg border border-border/70 bg-muted/10 p-3 transition-colors',
                tsRole && 'border-border/90 bg-muted/20',
              )}
            >
              <div class="mb-2 flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Label for="ins-{col.name}" class="font-mono text-ui-xs font-medium text-foreground">
                      {col.name}
                      {#if required}<span class="text-destructive" title="Required">*</span>{/if}
                    </Label>
                    <span class="font-mono text-[10px] text-muted-foreground">{dataType}</span>
                    {#if auto}
                      <span
                        class="rounded border border-border/60 bg-background px-1 py-px text-[10px] text-muted-foreground"
                        >auto</span
                      >
                    {:else if tsRole === 'created'}
                      <span
                        class="rounded border border-border/60 bg-background px-1 py-px text-[10px] text-muted-foreground"
                        >created</span
                      >
                    {:else if tsRole === 'updated'}
                      <span
                        class="rounded border border-border/60 bg-background px-1 py-px text-[10px] text-muted-foreground"
                        >updated</span
                      >
                    {/if}
                  </div>
                </div>
                {#if showUuid || showCuid}
                  <div class="flex shrink-0 gap-1">
                    {#if showUuid}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        class="h-7 gap-1 px-2 font-mono text-[10px]"
                        disabled={saving}
                        title="Generate UUID v4"
                        onclick={() => setDraft(col.name, generateUuid())}
                      >
                        <Hash class="size-3" />
                        UUID
                      </Button>
                    {/if}
                    {#if showCuid}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        class="h-7 gap-1 px-2 font-mono text-[10px]"
                        disabled={saving}
                        title="Generate CUID"
                        onclick={() => setDraft(col.name, generateCuid())}
                      >
                        <Fingerprint class="size-3" />
                        CUID
                      </Button>
                    {/if}
                  </div>
                {/if}
              </div>

              {#if enumValues}
                <select
                  id="ins-{col.name}"
                  value={drafts[col.name] ?? ''}
                  disabled={saving}
                  class={fieldClass}
                  onchange={(e) => setDraft(col.name, e.currentTarget.value)}
                >
                  <option value="">{col.nullable ? '— default / NULL —' : '— default —'}</option>
                  {#each enumValues as option (option)}
                    <option value={option}>{option}</option>
                  {/each}
                </select>
              {:else if isBooleanType(dataType)}
                <select
                  id="ins-{col.name}"
                  value={drafts[col.name] ?? ''}
                  disabled={saving}
                  class={fieldClass}
                  onchange={(e) => setDraft(col.name, e.currentTarget.value)}
                >
                  <option value="">{col.nullable ? '— default / NULL —' : '— default —'}</option>
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              {:else if dateTimePicker}
                <div class="flex gap-2">
                  <Input
                    id="ins-{col.name}"
                    type="datetime-local"
                    value={drafts[col.name] ?? ''}
                    disabled={saving}
                    class="h-9 flex-1 font-mono text-ui-sm shadow-sm"
                    oninput={(e) => setDraft(col.name, e.currentTarget.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class="h-9 shrink-0 gap-1.5 px-2.5 text-ui-xs"
                    disabled={saving}
                    title="Set to current date and time"
                    onclick={() => setDraft(col.name, nowDateTimeLocal())}
                  >
                    <CalendarClock class="size-3.5" />
                    Now
                  </Button>
                </div>
              {:else if dateOnly}
                <div class="flex gap-2">
                  <Input
                    id="ins-{col.name}"
                    type="date"
                    value={drafts[col.name] ?? ''}
                    disabled={saving}
                    class="h-9 flex-1 font-mono text-ui-sm shadow-sm"
                    oninput={(e) => setDraft(col.name, e.currentTarget.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class="h-9 shrink-0 px-2.5 text-ui-xs"
                    disabled={saving}
                    onclick={() => setDraft(col.name, nowDateOnly())}
                  >
                    Today
                  </Button>
                </div>
              {:else if timeOnly}
                <div class="flex gap-2">
                  <Input
                    id="ins-{col.name}"
                    type="time"
                    value={drafts[col.name] ?? ''}
                    disabled={saving}
                    class="h-9 flex-1 font-mono text-ui-sm shadow-sm"
                    oninput={(e) => setDraft(col.name, e.currentTarget.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class="h-9 shrink-0 px-2.5 text-ui-xs"
                    disabled={saving}
                    onclick={() => setDraft(col.name, nowTimeOnly())}
                  >
                    Now
                  </Button>
                </div>
              {:else}
                <Input
                  id="ins-{col.name}"
                  value={drafts[col.name] ?? ''}
                  disabled={saving}
                  placeholder={auto
                    ? 'Leave empty for auto value'
                    : col.nullable
                      ? 'NULL or value'
                      : 'Required'}
                  class="h-9 font-mono text-ui-sm shadow-sm"
                  oninput={(e) => setDraft(col.name, e.currentTarget.value)}
                />
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>

    <Dialog.Footer class="shrink-0 border-t border-border bg-muted/10 px-5 py-3.5">
      <p class="mr-auto hidden text-[10px] text-muted-foreground/70 sm:block">
        <kbd class="rounded border border-border bg-background px-1 font-mono">⌘↵</kbd> insert
      </p>
      <Button variant="outline" size="sm" disabled={saving} onclick={() => (open = false)}>
        Cancel
      </Button>
      <Button
        size="sm"
        disabled={saving || editableColumns.length === 0}
        onclick={() => void submit()}
      >
        {saving ? 'Inserting…' : 'Insert row'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
