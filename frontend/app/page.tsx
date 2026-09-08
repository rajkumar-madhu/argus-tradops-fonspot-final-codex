import Link from "next/link";
import {
  Activity, ArrowRight, Award, BellRing, BookOpen, BrainCircuit, Briefcase, Building2, ChartLine,
  ChartPie, CheckCircle2, CircleHelp, Clock, Cloud, Cpu, Database, FileText, Gauge, Globe, Landmark,
  Layers3, LifeBuoy, Linkedin, Lock, Mail, MessageSquare, Newspaper, Phone, Plug, Radio, Search,
  Server, Shield, ShieldCheck, SquareCode, Star, Table2, Ticket, TimerReset, TrendingUp, Twitter,
  Users, UsersRound, Wallet, Youtube, Zap,
} from "lucide-react";
import MarketTicker from "@/components/MarketTicker";
import LandingPreview from "@/components/LandingPreview";
import { MiniBars } from "@/components/Charts";

const MODULES: [React.ComponentType<any>, string, string, string][] = [
  [Activity, "Trading Operations", "Orders, trades, positions, holdings and P&L", "Monitor and analyse your trading activity in real time."],
  [BellRing, "Alerts & Incidents", "Real-time monitoring and intelligent alerting", "Detect anomalies early and get notified across channels."],
  [BrainCircuit, "RCA & Analysis", "AI-driven root cause analysis", "Correlate logs, metrics and traces to find root causes with evidence."],
  [Landmark, "Exchange Health", "Monitor all exchanges and market data", "Track connectivity, latency and data quality across exchanges."],
  [Users, "Users & Sessions", "Track user activity from journal logs", "Monitor logins, sessions, access patterns and anomalies."],
  [Server, "Infrastructure", "Kubernetes, servers, network and services", "Monitor your entire infrastructure stack in one place."],
];

const INTEGRATIONS = ["Elasticsearch", "Kibana", "Prometheus", "Grafana", "Kubernetes", "Vault", "Jenkins", "Keycloak", "DataDog"];

/* Three flagship surfaces, each with a small CSS-built preview. */
const SUITE: { icon: React.ComponentType<any>; name: string; tag: string; body: string; points: string[] }[] = [
  {
    icon: ChartLine, name: "Console", tag: "Live desk view",
    body: "The operations console for your trading desk: order flow, rejections and fills updating as the journal is written.",
    points: ["Streaming order book", "Rejection breakdown by reason", "Per-exchange fill quality"],
  },
  {
    icon: BrainCircuit, name: "RCA Studio", tag: "Evidence-first",
    body: "Paste an order number and get the full lifecycle back — every state change, correlated with infrastructure events.",
    points: ["Full order evidence chain", "Probable cause with confidence", "Similar past incidents"],
  },
  {
    icon: Table2, name: "Journal", tag: "Search & export",
    body: "Operator-friendly search across the Noren journal, with the field translation and PII masking already applied.",
    points: ["Query without knowing ES", "Masked accounts and IDs", "Export to CSV"],
  },
];

const SEGMENTS: [React.ComponentType<any>, string][] = [
  [Briefcase, "Trading desks"],
  [ShieldCheck, "Risk & compliance"],
  [Server, "Platform / SRE"],
  [BrainCircuit, "Support & L2"],
  [Building2, "Brokerages"],
  [Landmark, "Exchanges"],
];

const APIS: [React.ComponentType<any>, string, string][] = [
  [Radio, "Streaming events", "Server-sent order, rejection and exchange streams straight off the event bus."],
  [ChartPie, "Metrics", "Prometheus-format metrics for every collector, worker and API replica."],
  [FileText, "Incidents & RCA", "Read incidents, occurrence counts and stored root-cause evidence."],
  [Wallet, "Book & positions", "Intraday positions, holdings and mark-to-market snapshots."],
  [Newspaper, "Journal search", "Query the normalised Noren journal with masking applied server-side."],
];

const WHY: [React.ComponentType<any>, string, string][] = [
  [Lock, "Read-only by design", "TradeOps never places, cancels or modifies an order. Credentials stay read-only."],
  [Zap, "Built for the trading day", "One collector polls Elasticsearch; dashboards fan out from Redis, so load stays flat."],
  [Layers3, "Your data, your estate", "Runs entirely inside your environment. Nothing leaves the perimeter."],
  [LifeBuoy, "Support that knows markets", "Market-hours cover from people who have run trading infrastructure."],
];

const METRICS: [string, string][] = [
  ["99.99%", "System uptime"],
  ["<50ms", "Query latency"],
  ["5+", "Exchange segments"],
  ["100%", "On your infrastructure"],
];

const VOICES: [string, string, string][] = [
  ["We used to grep the journal by hand to explain a rejection. Now the evidence chain is already assembled when we open the ticket.", "Head of Trading Operations", "Institutional brokerage"],
  ["The read-only guarantee is what got it past our risk committee. It observes the stack and cannot touch it.", "Risk & Compliance Lead", "Prop trading firm"],
  ["Our L2 desk resolves exchange connectivity questions without escalating to the platform team any more.", "Platform Engineering Manager", "Retail broker"],
];

const RESOURCES: [string, string, string][] = [
  ["Architecture", "How the collector, event bus and correlation worker fit together", "8 min read"],
  ["Field mapping", "Translating Noren journal fields into TradeOps concepts", "6 min read"],
  ["Operations", "Running the stack on Kubernetes with HA Postgres and Redis", "10 min read"],
  ["Root cause", "Reading an RCA evidence chain and its confidence score", "5 min read"],
  ["Security", "PII masking, RBAC and keeping Elasticsearch credentials read-only", "7 min read"],
  ["Exchange health", "What heartbeat age and reject rate actually tell you", "4 min read"],
  ["Alerting", "Designing incident severity so P2 means something", "6 min read"],
  ["Onboarding", "Pointing TradeOps at an existing Filebeat and Logstash pipeline", "9 min read"],
];

const FAQS: [string, string][] = [
  ["What does TradeOps actually do?", "It reads your Noren trading journal out of Elasticsearch, correlates what it finds into incidents and root-cause cases, and serves dashboards over the result. It is an observability layer, not a trading system."],
  ["Can it place or modify orders?", "No. There is no write path to any trading system anywhere in the product, and the Elasticsearch credentials it uses are read-only. That constraint is architectural, not a setting."],
  ["Which exchanges and segments are covered?", "Anything present in the journal. Segments are read from the journal itself, so equities, F&O, currency and commodity all appear once they are being written."],
  ["Where does it run?", "Inside your environment — cloud, on-premise or hybrid. Kubernetes manifests ship with the product. No market or client data leaves your perimeter."],
  ["How does it authenticate users?", "Keycloak, using Authorization Code with PKCE. Roles map to permissions per route, so a support user and a risk user see different things."],
  ["Does it add load to Elasticsearch?", "Very little. A single leader-elected collector polls Elasticsearch; every dashboard and live stream reads from Redis instead, so opening more browsers does not multiply queries."],
  ["Is account data masked?", "Yes. Account numbers, client IDs and IP addresses are masked in the normalisation layer and again excluded at the query level."],
  ["Can we try it against sample data?", "Yes. You can run the full interface against a journal upload or your own Elasticsearch indices with no production write path."],
];

const SUPPORT: [React.ComponentType<any>, string, string[]][] = [
  [BookOpen, "Documentation", ["Getting started", "Architecture guide", "Field reference"]],
  [SquareCode, "Developers", ["API reference", "Event bus envelopes", "Metrics catalogue"]],
  [CircleHelp, "Knowledge base", ["Common rejections", "Exchange codes", "Troubleshooting"]],
  [Ticket, "Get help", ["Raise a ticket", "Contact support", "Status page"]],
];

export default function Landing() {
  return (
    <main className="landing">
      <nav className="landing-nav">
        <Link href="/" className="brand">
          <div className="brand-bars"><i /><i /><i /></div>
          <span><b>TradeOps</b><small>Trading Observability Platform</small></span>
        </Link>
        <div className="navlinks">
          <a href="#suite">Product</a>
          <a href="#platform">Modules</a>
          <a href="#apis">Developers</a>
          <a href="#integrations">Integrations</a>
          <a href="#resources">Resources</a>
          <a href="#support">Support</a>
        </div>
        <div className="nav-actions">
          <span className="nav-search" aria-label="Search"><Search size={16} /></span>
          <a className="nav-phone" href="#support"><Phone size={14} />Support desk</a>
          <Link className="secondary sm" href="/signin">Sign In</Link>
          <Link className="primary sm" href="/signup">Get Started</Link>
        </div>
      </nav>

      {/* Ticker sits directly under the nav, matching the reference layout */}
      <MarketTicker variant="strip" />

      <section className="hero centered">
        <div className="hero-copy">
          <div className="eyebrow">OBSERVE · ANALYZE · RESOLVE · STAY AHEAD</div>
          <h1>Complete Observability<br />for <span>Trading Operations</span></h1>
          <p>Unify orders, trades, risk, infrastructure and logs in one platform. Detect issues faster, resolve with AI-powered insights, and keep your trading systems always on.</p>
          <div className="hero-actions">
            <Link className="primary" href="/signup">Start Free Trial →</Link>
            <Link className="secondary" href="/signin">Get started</Link>
          </div>
          <div className="hero-tiles">
            <div><span className="tile-blue"><Zap size={16} /></span><b>Real-time visibility</b><small>Across your trading stack</small></div>
            <div><span className="tile-purple"><TimerReset size={16} /></span><b>Reduce MTTR</b><small>With AI-driven RCA</small></div>
            <div><span className="tile-amber"><Layers3 size={16} /></span><b>Built for scale</b><small>On-premise or cloud</small></div>
            <div><span className="tile-green"><ShieldCheck size={16} /></span><b>Secure &amp; compliant</b><small>Enterprise ready</small></div>
          </div>
        </div>
        <div className="hero-visual"><LandingPreview /></div>
      </section>

      <section id="integrations" className="integrations">
        <b>Integrates with your existing ecosystem</b>
        <div className="logo-row">
          {INTEGRATIONS.map((n) => <span key={n}><i>{n.slice(0, 1)}</i>{n}</span>)}
          <span className="more">and more…</span>
        </div>
      </section>

      {/* Three flagship surfaces, TrueData's product-module row */}
      <section id="suite" className="suite">
        <div className="section-head center">
          <div>
            <h2>One Platform, Three Ways In</h2>
            <p>Console, RCA Studio and Journal share one read-only pipeline off your Noren journal</p>
          </div>
        </div>
        <div className="suite-grid">
          {SUITE.map(({ icon: Icon, name, tag, body, points }) => (
            <article key={name} className="suite-card">
              <div className="suite-visual">
                <div className="suite-chrome"><i /><i /><i /></div>
                <div className="suite-body">
                  <div className="suite-rows">
                    <span /><span /><span /><span />
                  </div>
                  <MiniBars values={[28, 40, 34, 52, 46, 61, 55, 70, 64, 78]} cls="bar-blue" />
                </div>
              </div>
              <span className="suite-tag">{tag}</span>
              <h3><span className="feature-icon sm"><Icon size={17} /></span>TradeOps {name}</h3>
              <p>{body}</p>
              <ul className="ticks">
                {points.map((p) => <li key={p}><CheckCircle2 size={14} />{p}</li>)}
              </ul>
              <Link href="/signin" className="text-link">Explore {name} ›</Link>
            </article>
          ))}
        </div>
      </section>

      {/* Who it is for — TrueData's persona strip */}
      <section className="segments">
        <b>Built for everyone who keeps the desk running</b>
        <div className="segment-row">
          {SEGMENTS.map(([Icon, label]) => (
            <div key={label}><span><Icon size={20} /></span>{label}</div>
          ))}
        </div>
      </section>

      <section id="platform" className="platform">
        <div className="section-head">
          <div><h2>A Complete Platform for Trading Operations</h2><p>End-to-end observability, risk management and incident resolution</p></div>
          <Link href="/signin" className="text-link">View All Modules ›</Link>
        </div>
        <div className="feature-grid">
          {MODULES.map(([Icon, t, d, more]) => (
            <article key={t}><span className="feature-icon"><Icon size={20} /></span><h3>{t}</h3><p>{d}</p><small>{more}</small></article>
          ))}
        </div>
      </section>

      {/* Collector highlight — TrueData's Velocity block */}
      <section className="collector">
        <div className="collector-copy">
          <span className="eyebrow">TRADEOPS COLLECTOR</span>
          <h2>Drop it beside your existing pipeline</h2>
          <p>The collector reads the same Elasticsearch indices your Filebeat and Logstash setup already writes. No agent on the trading host, no change to the journal, no new write path.</p>
          <ul className="ticks lg">
            <li><CheckCircle2 size={16} />Leader-elected, so replicas are safe to run</li>
            <li><CheckCircle2 size={16} />Publishes only when state actually changes</li>
            <li><CheckCircle2 size={16} />Ships Prometheus metrics from the first minute</li>
          </ul>
          <div className="hero-actions">
            <Link className="primary" href="/signup">Start Free Trial</Link>
            <Link className="secondary" href="#apis">See the APIs</Link>
          </div>
        </div>
        <div className="collector-visual">
          <div className="pipe">
            <div className="pipe-node"><Database size={16} /><b>Noren Journal</b><small>Filebeat → Logstash</small></div>
            <div className="pipe-arrow"><ArrowRight size={15} /></div>
            <div className="pipe-node"><Search size={16} /><b>Elasticsearch</b><small>read-only</small></div>
            <div className="pipe-arrow"><ArrowRight size={15} /></div>
            <div className="pipe-node accent"><Cpu size={16} /><b>Collector</b><small>leader-elected</small></div>
            <div className="pipe-arrow"><ArrowRight size={15} /></div>
            <div className="pipe-node"><Plug size={16} /><b>Event bus</b><small>Redis streams</small></div>
            <div className="pipe-arrow"><ArrowRight size={15} /></div>
            <div className="pipe-node"><Gauge size={16} /><b>TradeOps UI</b><small>dashboards &amp; RCA</small></div>
          </div>
        </div>
      </section>

      {/* Developer APIs — TrueData's five-card API row */}
      <section id="apis" className="apis">
        <div className="section-head center">
          <div><h2>APIs for Your Own Tooling</h2><p>Everything the interface shows is available to your scripts and dashboards</p></div>
        </div>
        <div className="api-grid">
          {APIS.map(([Icon, title, body]) => (
            <article key={title}>
              <span className="feature-icon"><Icon size={19} /></span>
              <h4>{title}</h4>
              <p>{body}</p>
              <Link href="/signin" className="text-link">Reference ›</Link>
            </article>
          ))}
        </div>
      </section>

      <section id="observability" className="split">
        <div className="split-card">
          <div className="split-text">
            <h3>Real-time Observability</h3>
            <p>From application logs to business impact</p>
            <ul>
              <li><CheckCircle2 />Unified logs, metrics and traces</li>
              <li><CheckCircle2 />Real-time dashboards and alerts</li>
              <li><CheckCircle2 />AI-powered anomaly detection</li>
              <li><CheckCircle2 />Historical analysis and reporting</li>
            </ul>
          </div>
          <div className="split-visual">
            <div className="stat-bubble"><span>Orders</span><b>15,432</b><em className="up">▲ 12.4%</em></div>
            <div className="split-chart"><MiniBars values={[30, 34, 31, 42, 38, 50, 46, 58, 55, 66, 63, 74, 70, 82, 78, 88]} cls="bar-green" /></div>
            <div className="chart-axis"><span>09:00</span><span>12:00</span><span>15:00</span><span>18:00</span></div>
          </div>
        </div>
        <div className="split-card">
          <div className="split-text">
            <h3>AI-Powered RCA</h3>
            <p>Find issues. Fix faster.</p>
            <ul>
              <li><CheckCircle2 />Automatic log correlation</li>
              <li><CheckCircle2 />Root cause analysis with evidence</li>
              <li><CheckCircle2 />Similar incident recommendations</li>
              <li><CheckCircle2 />Reduced MTTR and faster resolution</li>
            </ul>
          </div>
          <div className="split-visual rca">
            <div className="rca-head"><span><i className="live-dot" /> NSE Market Data Latency</span><b>RCA Completed</b></div>
            <ol>
              <li>Detected anomaly in market data feed</li>
              <li>Identified network latency to NSE gateway</li>
              <li>Correlated with infrastructure logs</li>
              <li>Suggested resolution and verified</li>
            </ol>
            <Link href="/signin" className="text-link">View Full RCA ›</Link>
          </div>
        </div>
      </section>

      <section id="deployment" className="deployment">
        <div>
          <h2>Flexible Deployment for Your Environment</h2>
          <p>Deploy TradeOps anywhere: cloud, on-premise or hybrid.</p>
          <div className="deploy-cards">
            <div><Cloud /><b>Cloud</b><span>Quick deployment on AWS, Azure or GCP</span></div>
            <div><Server /><b>On-Premise</b><span>Full control within your infrastructure</span></div>
            <div><Layers3 /><b>Hybrid</b><span>Best of both worlds with unified management</span></div>
          </div>
        </div>
        <div className="enterprise">
          <h2>Enterprise Ready</h2>
          <ul>
            <li><Lock />Role-based access control</li>
            <li><Database />Audit logs and compliance</li>
            <li><ShieldCheck />Secure secret management</li>
            <li><Building2 />Multi-tenant architecture</li>
          </ul>
        </div>
      </section>

      {/* Why TradeOps — TrueData's credibility block */}
      <section id="why" className="why">
        <div className="section-head center">
          <div><h2>Why Teams Choose TradeOps</h2><p>Purpose-built for Indian market operations, not a repurposed APM</p></div>
        </div>
        <div className="why-metrics">
          {METRICS.map(([v, l]) => <div key={l}><b>{v}</b><span>{l}</span></div>)}
        </div>
        <div className="why-grid">
          {WHY.map(([Icon, title, body]) => (
            <article key={title}>
              <span className="feature-icon"><Icon size={19} /></span>
              <h4>{title}</h4>
              <p>{body}</p>
            </article>
          ))}
        </div>
        <div className="why-badge"><Award size={17} /><span>Read-only architecture · No write path to any trading system</span></div>
      </section>

      {/* Testimonials */}
      <section id="customers" className="voices">
        <div className="section-head center">
          <div>
            <span className="eyebrow">FROM THE DESK</span>
            <h2>What Operators Tell Us</h2>
          </div>
        </div>
        <div className="voice-grid">
          {VOICES.map(([quote, who, org]) => (
            <blockquote key={who}>
              <div className="stars">{[0, 1, 2, 3, 4].map((i) => <Star key={i} size={14} />)}</div>
              <p>“{quote}”</p>
              <footer>
                <span className="avatar">{who.slice(0, 1)}</span>
                <span><b>{who}</b><small>{org}</small></span>
              </footer>
            </blockquote>
          ))}
        </div>
        <div className="stats">
          <div><b>99.99%</b><span>System Uptime</span></div>
          <div><b>60%</b><span>Faster Incident Resolution</span></div>
          <div><b>40%</b><span>Reduction in Rejections</span></div>
          <div><b>5+</b><span>Exchanges Supported</span></div>
          <div><b>100K+</b><span>Orders Per Second</span></div>
        </div>
      </section>

      {/* Resources grid — TrueData's blog row */}
      <section id="resources" className="resources">
        <div className="section-head">
          <div><h2>Guides &amp; Documentation</h2><p>How the platform works, written for the people who run it</p></div>
          <Link href="/signin" className="text-link">View All Guides ›</Link>
        </div>
        <div className="resource-grid">
          {RESOURCES.map(([tag, title, read]) => (
            <article key={title}>
              <div className="resource-thumb"><BookOpen size={18} /></div>
              <span className="resource-tag">{tag}</span>
              <h4>{title}</h4>
              <small><Clock size={12} />{read}</small>
            </article>
          ))}
        </div>
      </section>

      {/* FAQ — native details/summary, no client JS */}
      <section id="faq" className="faq">
        <div className="section-head center">
          <div><h2>Frequently Asked Questions</h2><p>The things every evaluation asks in the first call</p></div>
        </div>
        <div className="faq-list">
          {FAQS.map(([q, a]) => (
            <details key={q} className="faq-item">
              <summary>{q}<CircleHelp size={16} /></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <div><h2>Ready to Transform Your Trading Operations?</h2><p>Get real-time visibility, reduce risk and keep your trading systems always on.</p></div>
        <div className="hero-actions">
          <Link className="primary light" href="/signup">Start Free Trial</Link>
          <Link className="secondary ghost" href="/signin">Get started</Link>
        </div>
        <small className="cta-note">Evaluate the full interface with your journal upload or Elasticsearch estate. No card, no commitment.</small>
      </section>

      {/* Support resource grid */}
      <section id="support" className="support">
        {SUPPORT.map(([Icon, title, links]) => (
          <div key={title}>
            <span className="feature-icon"><Icon size={18} /></span>
            <b>{title}</b>
            {links.map((l) => <a key={l} href="#footer">{l}</a>)}
          </div>
        ))}
      </section>

      <footer id="footer" className="landing-footer">
        <div className="footer-grid six">
          <div className="footer-brand">
            <div className="brand"><div className="brand-bars"><i /><i /><i /></div><span><b>TradeOps</b><small>Trading Observability Platform</small></span></div>
            <p>Read-only observability for Noren trading journals. TradeOps never places, cancels or modifies orders.</p>
            <form className="footer-signup" action="#footer">
              <input type="email" name="email" placeholder="Work email" aria-label="Work email" />
              <button type="submit">Subscribe</button>
            </form>
            <span className="footer-note">Release notes and incident post-mortems. No marketing.</span>
            <div className="socials">
              <a href="#footer" aria-label="LinkedIn"><Linkedin size={15} /></a>
              <a href="#footer" aria-label="Twitter"><Twitter size={15} /></a>
              <a href="#footer" aria-label="YouTube"><Youtube size={15} /></a>
            </div>
          </div>
          <div><b>Platform</b><a href="#suite">Console</a><a href="#suite">RCA Studio</a><a href="#suite">Journal</a><a href="#platform">Exchange Health</a><a href="#platform">Infrastructure</a></div>
          <div><b>Modules</b><a href="#platform">Trading Operations</a><a href="#platform">Alerts &amp; Incidents</a><a href="#platform">Users &amp; Sessions</a><a href="#deployment">Deployment</a></div>
          <div><b>Developers</b><a href="#apis">Streaming events</a><a href="#apis">Metrics</a><a href="#apis">Incidents &amp; RCA</a><a href="#apis">Journal search</a></div>
          <div><b>Resources</b><a href="#resources">Guides</a><a href="#faq">FAQ</a><a href="#why">Why TradeOps</a><a href="#customers">Customers</a></div>
          <div className="footer-contact">
            <b>Support</b>
            <a href="#support"><Mail size={13} />support@tradeops.example</a>
            <a href="#support"><Phone size={13} />Market-hours cover</a>
            <a href="#support"><MessageSquare size={13} />Raise a ticket</a>
            <span className="hours"><Clock size={13} />Mon–Sat · 08:30–17:30 IST</span>
          </div>
        </div>
        <div className="footer-legal">
          <span>© {new Date().getFullYear()} TradeOps. All rights reserved.</span>
          <span><a href="#terms">Terms &amp; Conditions</a> · <a href="#privacy">Privacy Policy</a> · <a href="#disclaimer">Disclaimer</a> · <a href="#refund">Refund Policy</a></span>
        </div>
      </footer>
    </main>
  );
}
