import { useMemo } from 'react'
import { Avatar, Badge, Bar, Button, Chart, Check, Count, Spinner, Stage, States, Window, type Act } from '../kit'
import { BarChart3, Building2, LayoutDashboard, Megaphone, Settings, TriangleAlert, Users, Wallet } from 'lucide-react'
import './sync-demo.css'

// GrowthGrid's product story: a sync runs, the numbers move, the automation
// flags a campaign whose CPL crossed its threshold, and the alert lands.
// The flag is cleared by hand — the reset's visible cause — and the next
// sync brings the next small delta, so data never rewinds in view.

type Tick = { spend: number; leads: number; avgCpl: number; chart: number[] }

type S = {
  syncing: boolean
  synced: boolean
  flagged: boolean
  toast: boolean
  tick: number
}

const initial: S = { syncing: false, synced: false, flagged: false, toast: false, tick: 0 }

// Intraday sync deltas: the first pull brings the new day in, later pulls
// nudge the same day forward. Values accumulate; nothing ever rolls back.
const TICKS: Tick[] = [
  { spend: 241380, leads: 318, avgCpl: 759, chart: [18.2, 17.6, 19.1, 21.4, 20.2, 22.8, 21.0, 23.5, 24.9, 22.4, 25.1, 26.3, 24.8, 27.2] },
  { spend: 252910, leads: 337, avgCpl: 750, chart: [17.6, 19.1, 21.4, 20.2, 22.8, 21.0, 23.5, 24.9, 22.4, 25.1, 26.3, 24.8, 27.2, 28.6] },
  { spend: 254120, leads: 339, avgCpl: 749, chart: [17.6, 19.1, 21.4, 20.2, 22.8, 21.0, 23.5, 24.9, 22.4, 25.1, 26.3, 24.8, 27.2, 28.9] },
  { spend: 255040, leads: 340, avgCpl: 750, chart: [17.6, 19.1, 21.4, 20.2, 22.8, 21.0, 23.5, 24.9, 22.4, 25.1, 26.3, 24.8, 27.2, 29.1] },
]

const inrFmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const numFmt = (n: number) => Math.round(n).toLocaleString('en-IN')

const REST = { wide: { x: 330, y: 70 }, compact: { x: 190, y: 66 } }
// The poster is the payoff: sync done, the flag and its alert on screen.
const POSTER: S = { syncing: false, synced: false, flagged: true, toast: true, tick: 1 }

// Progress lives outside the looped state: the values accumulate and the
// chart slides forward each cycle, so the data never rewinds in view. The
// loop seam check only sees keys of `initial`, and progress isn't one.
const progress = { tick: 0 }

async function script(a: Act<S>) {
  await a.wait(800)

  // Run a sync
  await a.move('sync')
  await a.wait(280)
  await a.click()
  // One frame, both halves: the spinner is already turning when the words
  // begin their roll, and the numbers land while it spins.
  a.put({ syncing: true, synced: false })
  progress.tick += 1
  a.put({ tick: (progress.tick % TICKS.length) + 1 })
  await a.wait(1700)
  await a.set({ syncing: false, synced: true })
  await a.wait(800)

  // The automation finds the breach: CPL rolls up, the flag lands
  await a.set({ flagged: true })
  await a.wait(700)
  await a.set({ toast: true })
  await a.mark('alert')
  await a.wait(2600)

  // A person clears the flag — the loop's reset has a cause
  await a.move('clear')
  await a.wait(320)
  await a.click()
  a.put({ flagged: false, toast: false })
  await a.wait(60)
  await a.move('rest')
  await a.wait(900)
  await a.set({ synced: false, tick: 0 })
  await a.wait(500)
}

export default function SyncDemo({ className = '' }: { className?: string }) {
  return (
    <Stage
      width={680}
      height={600}
      compact={{ below: 600, width: 358, height: 340 }}
      initial={initial}
      poster={POSTER}
      script={script}
      cursor={{ at: REST }}
      className="gg-sync"
    >
      {(s, rect, layout) => {
        // Tick 0 is the full pull (the new day lands); 1 and 2 are intraday
        // nudges of that same day, and 3 wraps back to a fresh full pull.
        const step = progress.tick % TICKS.length
        const t = TICKS[step]
        const chart =
          step === 0
            ? [...t.chart.slice(1), t.chart[0] + 1.1 + (progress.tick / TICKS.length) * 0.4]
            : t.chart
        return (
          <>
            <Window
              title={layout === 'compact' ? undefined : 'Dashboard'}
              sidebar={layout === 'compact' ? undefined : <SideNav />}
              sidebarWidth={152}
              className="gg-window"
              toolbar={
                <Button
                  variant="secondary"
                  size="medium"
                  data-target="sync"
                  className="gg-sync-button"
                  icon={s.syncing ? <Spinner size={12} /> : s.synced ? <Check on size={12} /> : undefined}
                >
                  {s.syncing ? 'Syncing…' : s.synced ? 'Synced' : 'Sync now'}
                </Button>
              }
              body={{ className: 'gg-body' }}
            >
                <div className="gg-content">
                {layout === 'compact' && <div className="gg-page-title">Dashboard</div>}
                  <div className="gg-stats">
                    <Stat label="Spend · 14 days" value={<Count value={t.spend} format={inrFmt} />} />
                    <Stat label="Leads · 14 days" value={<Count value={t.leads} format={numFmt} />} />
                    <Stat label="Avg CPL" value={<Count value={t.avgCpl} format={inrFmt} />} className="gg-stat-cpl" />
                  </div>

                <div className="gg-card gg-chart-card">
                  <div className="gg-card-head">
                    <span className="gg-card-title">Spend</span>
                    <span className="gg-card-faint">Last 14 days</span>
                  </div>
                  <Chart data={chart} width={layout === 'compact' ? 280 : 372} height={104} area dot className="gg-chart" />
                  <div className="gg-chart-dates">
                    <span>4 Nov</span>
                    <span>17 Nov</span>
                  </div>
                </div>

                <div className="gg-card gg-campaigns">
                  <div className="gg-card-head">
                    <span className="gg-card-title">Campaigns</span>
                    <span className="gg-card-faint">Automation on</span>
                  </div>
                  <CampaignRow name="Festive Sale" platform="Google Ads" status={<Badge tone="success" dot>Active</Badge>} cpl={381} />
                  <CampaignRow
                    name="Retargeting"
                    platform="Meta Ads"
                    status={
                      <States
                        value={s.flagged ? 'flag' : 'ok'}
                        states={{
                          ok: <Badge tone="success" dot>Active</Badge>,
                          flag: (
                            <Badge tone="danger" icon={<span className="gg-flag-glyph"><TriangleAlert size={10} strokeWidth={2.25} /></span>}>
                              CPL high
                            </Badge>
                          ),
                        }}
                      />
                    }
                    cpl={s.flagged ? <Count value={568} format={inrFmt} duration={420} /> : '₹402'}
                    cplDanger={s.flagged}
                    action={
                      s.flagged ? (
                        <Button variant="ghost" size="small" data-target="clear" className="gg-clear-btn">
                          Clear
                        </Button>
                      ) : null
                    }
                  />
                  <CampaignRow name="Store Visits" platform="Google Ads" status={<Badge tone="success" dot>Active</Badge>} cpl={288} />
                  <div className="gg-row gg-row--filler" aria-hidden>
                    <Bar w={86} h={7} tone={2} />
                    <Bar w={46} h={18} r={9} tone={1} className="gg-row-pill" />
                    <Bar w={38} h={7} tone={2} className="gg-row-cplbar" />
                    <span />
                  </div>
                  <div className="gg-row gg-row--filler" aria-hidden>
                    <Bar w={64} h={7} tone={2} />
                    <Bar w={46} h={18} r={9} tone={1} className="gg-row-pill" />
                    <Bar w={30} h={7} tone={1} className="gg-row-cplbar" />
                    <span />
                  </div>
                </div>

                <div className="gg-toast" data-show={s.toast} role="status">
                  <span className="gg-toast-icon"><TriangleAlert size={14} strokeWidth={2.25} /></span>
                  <span className="gg-toast-body">
                    <span className="gg-toast-title">CPL alert</span>
                    <span className="gg-toast-text">Retargeting crossed ₹500 per lead</span>
                  </span>
                  <span className="gg-toast-time">now</span>
                </div>
              </div>
            </Window>
            <span data-target="rest" style={{ position: 'absolute', left: REST[layout].x, top: REST[layout].y }} />
          </>
        )
      }}
    </Stage>
  )
}

function Stat({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={`gg-stat ${className}`}>
      <span className="gg-stat-label">{label}</span>
      <span className="gg-stat-value">{value}</span>
    </div>
  )
}

function CampaignRow({
  name,
  platform,
  status,
  cpl,
  cplDanger = false,
  action = null,
}: {
  name: string
  platform: string
  status: React.ReactNode
  cpl: number | React.ReactNode
  cplDanger?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="gg-row" data-flagged={cplDanger || undefined}>
      <span className="gg-row-id">
        <span className="gg-row-name">{name}</span>
        <span className="gg-row-platform">{platform}</span>
      </span>
      <span className="gg-row-status">{status}</span>
      <span className={`gg-row-cpl${cplDanger ? ' is-danger' : ''}`}>
        <span className="gg-row-cpl-label">CPL</span>
        {typeof cpl === 'number' ? inrFmt(cpl) : cpl}
      </span>
      <span className="gg-row-action">{action}</span>
    </div>
  )
}

function SideNav() {
  const items = useMemo(
    () => [
      { icon: LayoutDashboard, label: 'Dashboard', active: true },
      { icon: Megaphone, label: 'Campaigns', active: false },
      { icon: Users, label: 'Leads', active: false },
      { icon: Building2, label: 'Clients', active: false },
      { icon: BarChart3, label: 'Reports', active: false },
      { icon: Wallet, label: 'Billing', active: false },
      { icon: Settings, label: 'Settings', active: false },
    ],
    []
  )
  return (
    <div className="gg-nav">
      <div className="gg-brand">
        <span className="gg-brand-name">GrowthGrid</span>
      </div>
      <nav className="gg-nav-items">
        {items.map((item) => (
          <span key={item.label} className={`gg-nav-item${item.active ? ' is-active' : ''}`}>
            <item.icon size={14} strokeWidth={2} aria-hidden />
            <span className="gg-nav-label">{item.label}</span>
          </span>
        ))}
      </nav>
      <div className="gg-nav-foot">
        <div className="gg-workspace" aria-hidden>
          <span className="gg-workspace-mark">G</span>
          <span className="gg-workspace-meta">
            <span className="gg-workspace-name">GrowthGrid</span>
            <span className="gg-workspace-plan">Agency plan</span>
          </span>
        </div>
        <div className="gg-nav-user">
          <Avatar name="Ava Shah" size={24} />
          <span className="gg-nav-user-meta">
            <span className="gg-nav-user-name">Ava Shah</span>
            <span className="gg-nav-user-role">Admin</span>
          </span>
        </div>
      </div>
    </div>
  )
}
