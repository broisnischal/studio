<script>
  import { executeSql } from '$lib/api.js'
  import ShieldCheck from '@lucide/svelte/icons/shield-check'
  import Users from '@lucide/svelte/icons/users'
  import Lock from '@lucide/svelte/icons/lock'
  import LockOpen from '@lucide/svelte/icons/lock-open'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Plus from '@lucide/svelte/icons/plus'
  import Check from '@lucide/svelte/icons/check'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import KeyRound from '@lucide/svelte/icons/key-round'
  import { toast } from 'svelte-sonner'
  import { cn } from '$lib/utils.js'
  import SecuritySqlModal from './SecuritySqlModal.svelte'

  let { active = false } = $props()

  /** @type {'roles' | 'policies' | 'rls'} */
  let activeTab = $state('roles')

  /** @type {Record<string, unknown>[] | null} */
  let roles = $state(null)
  let rolesLoading = $state(false)
  let rolesError = $state('')

  /** @type {Record<string, unknown>[] | null} */
  let policies = $state(null)
  let policiesLoading = $state(false)
  let policiesError = $state('')

  /** @type {Record<string, unknown>[] | null} */
  let rlsTables = $state(null)
  let rlsLoading = $state(false)
  let rlsError = $state('')

  /** @type {{ title: string } | null} */
  let sqlModal = $state(null)
  let sqlDraft = $state('')
  let sqlRunning = $state(false)

  /** @type {number | null} */
  let expandedPolicy = $state(null)

  /** @param {{ columns?: {name:string}[], rows?: unknown[][] } | null} result */
  function toRecords(result) {
    if (!result?.columns || !result?.rows) return []
    const cols = result.columns.map((c) => c.name)
    return result.rows.map((row) =>
      /** @type {Record<string, unknown>} */
      (Object.fromEntries(cols.map((c, i) => [c, row[i]])))
    )
  }

  async function loadRoles() {
    rolesLoading = true; rolesError = ''
    try {
      roles = toRecords(await executeSql(`
        SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin,
               rolreplication, rolbypassrls, rolconnlimit,
               rolvaliduntil::text AS rolvaliduntil
        FROM pg_catalog.pg_roles
        ORDER BY rolcanlogin DESC, rolname
      `))
    } catch (e) { rolesError = String(e) }
    finally { rolesLoading = false }
  }

  async function loadPolicies() {
    policiesLoading = true; policiesError = ''
    try {
      policies = toRecords(await executeSql(`
        SELECT schemaname, tablename, policyname, permissive,
               array_to_string(roles, ', ') AS roles, cmd, qual, with_check
        FROM pg_catalog.pg_policies
        ORDER BY schemaname, tablename, policyname
      `))
    } catch (e) { policiesError = String(e) }
    finally { policiesLoading = false }
  }

  async function loadRls() {
    rlsLoading = true; rlsError = ''
    try {
      rlsTables = toRecords(await executeSql(`
        SELECT n.nspname AS schema, c.relname AS table_name,
               c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r'
          AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
        ORDER BY n.nspname, c.relname
      `))
    } catch (e) { rlsError = String(e) }
    finally { rlsLoading = false }
  }

  function refresh() {
    if (activeTab === 'roles') { roles = null; void loadRoles() }
    else if (activeTab === 'policies') { policies = null; void loadPolicies() }
    else { rlsTables = null; void loadRls() }
  }

  async function executeSqlModal() {
    if (!sqlDraft.trim()) return
    sqlRunning = true
    try {
      await executeSql(sqlDraft)
      toast.success('Executed successfully')
      sqlModal = null
      refresh()
    } catch (e) {
      toast.error('Execution failed', { description: String(e) })
    } finally { sqlRunning = false }
  }

  function openCreateRoleModal() {
    sqlDraft = `CREATE ROLE new_role WITH LOGIN PASSWORD 'changeme';`
    sqlModal = { title: 'Create Role' }
  }

  /** @param {Record<string,unknown>} role */
  function openAlterRoleModal(role) {
    sqlDraft = `-- Modify role "${role.rolname}"\nALTER ROLE "${role.rolname}" WITH LOGIN;\n\n-- Other options:\n-- ALTER ROLE "${role.rolname}" SUPERUSER;\n-- ALTER ROLE "${role.rolname}" CREATEDB;\n-- ALTER ROLE "${role.rolname}" CREATEROLE;\n-- ALTER ROLE "${role.rolname}" BYPASSRLS;\n-- DROP ROLE "${role.rolname}";`
    sqlModal = { title: `Edit role: ${role.rolname}` }
  }

  function openCreatePolicyModal() {
    sqlDraft = `CREATE POLICY policy_name\n  ON public.table_name\n  AS PERMISSIVE          -- or RESTRICTIVE\n  FOR ALL                -- SELECT | INSERT | UPDATE | DELETE\n  TO PUBLIC              -- role name or PUBLIC\n  USING (true)           -- row-level USING expression\n  WITH CHECK (true);     -- row-level WITH CHECK expression`
    sqlModal = { title: 'Create Policy' }
  }

  /** @param {Record<string,unknown>} row */
  function openToggleRlsModal(row) {
    const on = bool(row.rls_enabled)
    sqlDraft = on
      ? `ALTER TABLE "${row.schema}"."${row.table_name}" DISABLE ROW LEVEL SECURITY;`
      : `ALTER TABLE "${row.schema}"."${row.table_name}" ENABLE ROW LEVEL SECURITY;`
    sqlModal = { title: `${on ? 'Disable' : 'Enable'} RLS — ${row.schema}.${row.table_name}` }
  }

  $effect(() => {
    if (activeTab === 'roles'    && roles     === null && !rolesLoading)    loadRoles()
    else if (activeTab === 'policies' && policies  === null && !policiesLoading) loadPolicies()
    else if (activeTab === 'rls' && rlsTables === null && !rlsLoading)      loadRls()
  })

  const bool = (v) => v === true || v === 't' || v === 'true' || v === 1

  const isLoading = $derived(
    (activeTab === 'roles'    && (rolesLoading    || roles     === null)) ||
    (activeTab === 'policies' && (policiesLoading || policies  === null)) ||
    (activeTab === 'rls'      && (rlsLoading      || rlsTables === null))
  )

  const TABS = [
    { id: 'roles',    label: 'Roles & Users',      icon: Users },
    { id: 'policies', label: 'Policies',            icon: ShieldCheck },
    { id: 'rls',      label: 'Row Level Security',  icon: Lock },
  ]
</script>

<!-- Ctrl/Cmd+R → refresh active tab -->
<svelte:window onkeydown={(e) => {
  if (!active || sqlModal) return
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'r') {
    e.preventDefault()
    refresh()
  }
}} />

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">

  <!-- Header -->
  <div class="studio-chrome flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
    <ShieldCheck class="size-3.5 shrink-0 text-muted-foreground/70" />
    <span class="font-mono text-ui-sm font-medium">Security</span>
    <div class="flex-1"></div>
    <button
      type="button"
      class={cn(
        'inline-flex size-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground',
        isLoading && 'pointer-events-none',
      )}
      title="Refresh (⌘R)"
      onclick={refresh}
    >
      <RefreshCw class={cn('size-3.5', isLoading && 'animate-spin')} />
    </button>
  </div>

  <!-- Tab bar -->
  <div class="flex shrink-0 items-stretch gap-0 border-b border-border bg-panel/80 px-1">
    {#each TABS as tab (tab.id)}
      {@const Icon = tab.icon}
      <button
        type="button"
        class={cn(
          'flex items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-ui-xs transition-colors',
          activeTab === tab.id
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground/70 hover:text-foreground',
        )}
        onclick={() => { activeTab = /** @type {any} */ (tab.id) }}
      >
        <Icon class="size-3 shrink-0 opacity-60" />
        {tab.label}
      </button>
    {/each}
  </div>

  <!-- Content area -->
  <div class="min-h-0 flex-1 overflow-auto">

    <!-- ── Roles ── -->
    {#if activeTab === 'roles'}
      <!-- Action bar -->
      <div class="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <div class="flex items-center gap-2">
          <Users class="size-3.5 text-muted-foreground/50" />
          <span class="font-mono text-ui-xs text-muted-foreground">
            {roles?.length ?? 0} role{(roles?.length ?? 0) === 1 ? '' : 's'}
          </span>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 font-mono text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          onclick={openCreateRoleModal}
        >
          <Plus class="size-3 shrink-0" />
          New role
        </button>
      </div>

      {#if rolesLoading || roles === null}
        <div class="flex items-center justify-center gap-2 py-16 text-muted-foreground/50">
          <RefreshCw class="size-4 animate-spin" />
          <span class="font-mono text-ui-sm">Loading roles…</span>
        </div>
      {:else if rolesError}
        <div class="px-6 py-8 text-center">
          <p class="font-mono text-ui-xs text-destructive">{rolesError}</p>
          <button onclick={loadRoles} class="mt-3 font-mono text-ui-xs text-muted-foreground underline hover:text-foreground">Retry</button>
        </div>
      {:else if roles.length === 0}
        <div class="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <Users class="size-8 text-muted-foreground/15" />
          <p class="font-mono text-ui-xs text-muted-foreground/60">No roles found</p>
        </div>
      {:else}
        <table class="w-full text-ui-xs">
          <thead class="sticky top-0 z-10 bg-panel">
            <tr class="border-b border-border/50 text-left">
              <th class="px-4 py-2.5 font-mono text-[11px] font-medium text-muted-foreground/70">Role</th>
              <th class="px-3 py-2.5 text-center font-mono text-[11px] font-medium text-muted-foreground/70">Login</th>
              <th class="px-3 py-2.5 text-center font-mono text-[11px] font-medium text-muted-foreground/70">Superuser</th>
              <th class="px-3 py-2.5 text-center font-mono text-[11px] font-medium text-muted-foreground/70">CreateDB</th>
              <th class="px-3 py-2.5 text-center font-mono text-[11px] font-medium text-muted-foreground/70">CreateRole</th>
              <th class="px-3 py-2.5 text-center font-mono text-[11px] font-medium text-muted-foreground/70">BypassRLS</th>
              <th class="px-3 py-2.5 font-mono text-[11px] font-medium text-muted-foreground/70">Conn limit</th>
              <th class="px-3 py-2.5 font-mono text-[11px] font-medium text-muted-foreground/70">Expires</th>
              <th class="w-10 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {#each (roles ?? []) as role (role.rolname)}
              {@const isLogin = bool(role.rolcanlogin)}
              {@const isSuper = bool(role.rolsuper)}
              <tr class="group border-b border-border/30 transition-colors hover:bg-accent/10">
                <td class="px-4 py-2">
                  <div class="flex items-center gap-2.5">
                    <span class={cn(
                      'inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold uppercase',
                      isSuper ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
                      isLogin ? 'bg-primary/12 text-primary' :
                      'bg-muted text-muted-foreground',
                    )}>
                      {String(role.rolname).slice(0, 2)}
                    </span>
                    <span class="font-mono text-ui-xs font-medium text-foreground">{role.rolname}</span>
                    {#if isSuper}
                      <span class="rounded-sm bg-amber-500/10 px-1 py-px font-mono text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">superuser</span>
                    {/if}
                  </div>
                </td>
                {#each [
                  { col: 'rolcanlogin', accent: 'text-primary' },
                  { col: 'rolsuper',    accent: 'text-amber-500' },
                  { col: 'rolcreatedb', accent: 'text-primary' },
                  { col: 'rolcreaterole', accent: 'text-primary' },
                  { col: 'rolbypassrls',  accent: 'text-primary' },
                ] as f (f.col)}
                  <td class="px-3 py-2 text-center">
                    {#if bool(role[f.col])}
                      <Check class={cn('mx-auto size-3.5', f.accent)} />
                    {:else}
                      <span class="text-muted-foreground/20">—</span>
                    {/if}
                  </td>
                {/each}
                <td class="px-3 py-2 font-mono text-ui-xs tabular-nums text-muted-foreground/70">
                  {role.rolconnlimit === -1 || role.rolconnlimit == null ? '∞' : role.rolconnlimit}
                </td>
                <td class="px-3 py-2 font-mono text-ui-xs text-muted-foreground/60">
                  {role.rolvaliduntil ?? '—'}
                </td>
                <td class="px-2 py-2">
                  <button
                    type="button"
                    class="invisible inline-flex size-6 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground group-hover:visible"
                    onclick={() => openAlterRoleModal(role)}
                    title="Edit"
                  >
                    <KeyRound class="size-3" />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}

    <!-- ── Policies ── -->
    {:else if activeTab === 'policies'}
      <div class="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
        <div class="flex items-center gap-2">
          <ShieldCheck class="size-3.5 text-muted-foreground/50" />
          <span class="font-mono text-ui-xs text-muted-foreground">
            {policies?.length ?? 0} polic{(policies?.length ?? 0) === 1 ? 'y' : 'ies'}
          </span>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 font-mono text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          onclick={openCreatePolicyModal}
        >
          <Plus class="size-3 shrink-0" />
          New policy
        </button>
      </div>

      {#if policiesLoading || policies === null}
        <div class="flex items-center justify-center gap-2 py-16 text-muted-foreground/50">
          <RefreshCw class="size-4 animate-spin" />
          <span class="font-mono text-ui-sm">Loading policies…</span>
        </div>
      {:else if policiesError}
        <div class="px-6 py-8 text-center">
          <p class="font-mono text-ui-xs text-destructive">{policiesError}</p>
          <button onclick={loadPolicies} class="mt-3 font-mono text-ui-xs text-muted-foreground underline hover:text-foreground">Retry</button>
        </div>
      {:else if policies.length === 0}
        <div class="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <ShieldCheck class="size-9 text-muted-foreground/10" />
          <p class="font-mono text-ui-xs font-medium text-muted-foreground">No RLS policies</p>
          <p class="max-w-xs font-mono text-[11px] text-muted-foreground/50">Enable Row Level Security on a table, then add a policy to control row access.</p>
          <button
            type="button"
            class="mt-1 inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onclick={openCreatePolicyModal}
          >
            <Plus class="size-3" />Create first policy
          </button>
        </div>
      {:else}
        <table class="w-full text-ui-xs">
          <thead class="sticky top-0 z-10 bg-panel">
            <tr class="border-b border-border/50 text-left">
              <th class="px-4 py-2.5 font-mono text-[11px] font-medium text-muted-foreground/70">Table</th>
              <th class="px-3 py-2.5 font-mono text-[11px] font-medium text-muted-foreground/70">Policy name</th>
              <th class="px-3 py-2.5 font-mono text-[11px] font-medium text-muted-foreground/70">Command</th>
              <th class="px-3 py-2.5 font-mono text-[11px] font-medium text-muted-foreground/70">Roles</th>
              <th class="w-24 px-3 py-2.5 font-mono text-[11px] font-medium text-muted-foreground/70">Type</th>
              <th class="w-9 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {#each (policies ?? []) as pol, i (i)}
              {@const isPermissive = (pol.permissive ?? '').toString().toUpperCase() === 'PERMISSIVE'}
              <tr class={cn('border-b border-border/25 transition-colors hover:bg-accent/10', expandedPolicy === i && 'bg-accent/10')}>
                <td class="px-4 py-2 font-mono">
                  <span class="text-muted-foreground/50">{pol.schemaname}.</span><span class="text-foreground">{pol.tablename}</span>
                </td>
                <td class="px-3 py-2 font-mono text-foreground/80">{pol.policyname}</td>
                <td class="px-3 py-2">
                  <span class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">{pol.cmd}</span>
                </td>
                <td class="max-w-[120px] truncate px-3 py-2 font-mono text-muted-foreground/70">{pol.roles || 'public'}</td>
                <td class="px-3 py-2">
                  <span class={cn(
                    'rounded px-1.5 py-0.5 font-mono text-[10px] font-medium',
                    isPermissive ? 'bg-primary/10 text-primary' : 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
                  )}>{isPermissive ? 'Permissive' : 'Restrictive'}</span>
                </td>
                <td class="px-2 py-2">
                  <button
                    type="button"
                    class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground"
                    onclick={() => { expandedPolicy = expandedPolicy === i ? null : i }}
                  >
                    <ChevronDown class={cn('size-3 transition-transform duration-150', expandedPolicy === i && 'rotate-180')} />
                  </button>
                </td>
              </tr>
              {#if expandedPolicy === i}
                <tr class="border-b border-border/25 bg-muted/20">
                  <td colspan="6" class="px-5 py-3">
                    <div class="grid gap-3 {pol.qual && pol.with_check ? 'grid-cols-2' : 'grid-cols-1'}">
                      {#if pol.qual}
                        <div>
                          <p class="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">USING (check)</p>
                          <pre class="rounded-md border border-border/40 bg-background/80 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/90">{pol.qual}</pre>
                        </div>
                      {/if}
                      {#if pol.with_check}
                        <div>
                          <p class="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">WITH CHECK</p>
                          <pre class="rounded-md border border-border/40 bg-background/80 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/90">{pol.with_check}</pre>
                        </div>
                      {/if}
                    </div>
                  </td>
                </tr>
              {/if}
            {/each}
          </tbody>
        </table>
      {/if}

    <!-- ── RLS Status ── -->
    {:else if activeTab === 'rls'}
      {@const enabledCount = (rlsTables ?? []).filter(r => bool(r.rls_enabled)).length}
      <div class="flex items-center gap-3 border-b border-border/40 px-4 py-2.5">
        <Lock class="size-3.5 text-muted-foreground/50" />
        <span class="font-mono text-ui-xs text-muted-foreground">
          {enabledCount} of {rlsTables?.length ?? 0} tables protected
        </span>
        {#if rlsTables && rlsTables.length > 0}
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/60">
            <div
              class="h-full rounded-full bg-primary/50 transition-all duration-500"
              style="width: {Math.round(enabledCount / rlsTables.length * 100)}%"
            ></div>
          </div>
          <span class="font-mono text-ui-2xs text-muted-foreground/50 tabular-nums">
            {Math.round(enabledCount / rlsTables.length * 100)}%
          </span>
        {/if}
      </div>

      {#if rlsLoading || rlsTables === null}
        <div class="flex items-center justify-center gap-2 py-16 text-muted-foreground/50">
          <RefreshCw class="size-4 animate-spin" />
          <span class="font-mono text-ui-sm">Loading tables…</span>
        </div>
      {:else if rlsError}
        <div class="px-6 py-8 text-center">
          <p class="font-mono text-ui-xs text-destructive">{rlsError}</p>
          <button onclick={loadRls} class="mt-3 font-mono text-ui-xs text-muted-foreground underline hover:text-foreground">Retry</button>
        </div>
      {:else}
        <table class="w-full text-ui-xs">
          <thead class="sticky top-0 z-10 bg-panel">
            <tr class="border-b border-border/50 text-left">
              <th class="px-4 py-2.5 font-mono text-[11px] font-medium text-muted-foreground/70">Schema</th>
              <th class="px-3 py-2.5 font-mono text-[11px] font-medium text-muted-foreground/70">Table</th>
              <th class="px-3 py-2.5 text-center font-mono text-[11px] font-medium text-muted-foreground/70">RLS</th>
              <th class="px-3 py-2.5 text-center font-mono text-[11px] font-medium text-muted-foreground/70">Force RLS</th>
              <th class="w-28 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {#each (rlsTables ?? []) as row (`${row.schema}.${row.table_name}`)}
              {@const enabled = bool(row.rls_enabled)}
              {@const forced  = bool(row.rls_forced)}
              <tr class="group border-b border-border/25 transition-colors hover:bg-accent/10">
                <td class="px-4 py-2 font-mono text-muted-foreground/60">{row.schema}</td>
                <td class="px-3 py-2 font-mono font-medium text-foreground">{row.table_name}</td>
                <td class="px-3 py-2 text-center">
                  {#if enabled}
                    <span class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium text-primary">
                      <Lock class="size-2.5" />On
                    </span>
                  {:else}
                    <span class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground/60">
                      <LockOpen class="size-2.5" />Off
                    </span>
                  {/if}
                </td>
                <td class="px-3 py-2 text-center">
                  {#if forced}
                    <Check class="mx-auto size-3.5 text-primary" />
                  {:else}
                    <span class="text-muted-foreground/20">—</span>
                  {/if}
                </td>
                <td class="px-3 py-2">
                  <button
                    type="button"
                    class={cn(
                      'invisible w-full rounded-md px-2.5 py-1 font-mono text-[11px] font-medium transition-colors group-hover:visible',
                      enabled
                        ? 'border border-border/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                        : 'bg-primary/10 text-primary hover:bg-primary/15',
                    )}
                    onclick={() => openToggleRlsModal(row)}
                  >{enabled ? 'Disable RLS' : 'Enable RLS'}</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {/if}
  </div>
</div>

{#if sqlModal}
  <SecuritySqlModal
    title={sqlModal.title}
    bind:sql={sqlDraft}
    running={sqlRunning}
    onclose={() => { sqlModal = null }}
    onrun={executeSqlModal}
  />
{/if}
