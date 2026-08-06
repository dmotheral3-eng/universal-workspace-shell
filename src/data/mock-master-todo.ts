import type { MasterTodoRow, MasterTodoSource } from "./master-todo-types";

function row(
  lane: string,
  lane_key: string,
  source: string,
  item_id: string,
  title: string,
  detail: string,
  status: string,
  bucket: MasterTodoRow["bucket"],
  ref_url: string | null,
  age_hours: number,
): MasterTodoRow {
  return {
    lane,
    lane_key,
    source,
    item_id,
    title,
    detail,
    status,
    bucket,
    ref_url,
    age_hours,
    updated_at: new Date(Date.now() - age_hours * 3600_000).toISOString(),
  };
}

function generateOSRows(): MasterTodoRow[] {
  const lane = "Centripetal OS";
  const key = "os";
  const active: MasterTodoRow[] = [
    row(lane, key, "GitHub", "os-1", "Kernel scheduler deadlock on ARM64", "Race condition in CFS when migrating tasks across NUMA nodes", "open", "active", "https://github.com/centripetal/os/issues/1201", 3),
    row(lane, key, "GitHub", "os-2", "Memory page compaction stalls under pressure", "Compaction kthread blocks direct reclaim path for 200ms+", "open", "active", "https://github.com/centripetal/os/issues/1198", 5),
    row(lane, key, "Linear", "os-3", "Implement RISC-V vector extension support", "Add V-extension context save/restore to task switch path", "in-progress", "active", null, 24),
    row(lane, key, "GitHub", "os-4", "Filesystem journal replay corrupts extent tree", "XFS log recovery mishandles split extents after unclean shutdown", "open", "active", "https://github.com/centripetal/os/issues/1195", 8),
    row(lane, key, "Linear", "os-5", "Update ACPI thermal zone handling", "Current trip point logic ignores passive cooling preference", "open", "active", null, 12),
    row(lane, key, "GitHub", "os-6", "Network driver Tx ring overflow on 100G NICs", "Descriptor exhaustion causes silent packet drops", "open", "active", "https://github.com/centripetal/os/issues/1190", 16),
    row(lane, key, "Linear", "os-7", "Build system: parallel link phase OOMs at -j64", "Gold linker peaks at 48 GB RSS for debug builds", "open", "active", null, 20),
    row(lane, key, "GitHub", "os-8", "USB4 tunneling fails for DP alt-mode", "PCIe tunnel setup races with DP bandwidth allocation", "in-progress", "active", "https://github.com/centripetal/os/issues/1187", 28),
    row(lane, key, "GitHub", "os-9", "Audit subsystem drops records under load", "Backlog queue overflow when >10k syscalls/sec audited", "open", "active", "https://github.com/centripetal/os/issues/1185", 36),
    row(lane, key, "Linear", "os-10", "Add io_uring support for splice operations", "Currently falls back to sync path for pipe-to-socket splice", "open", "active", null, 48),
    row(lane, key, "GitHub", "os-11", "BPF verifier rejects valid bounded-loop programs", "Pruning logic too aggressive for nested loop patterns", "open", "active", "https://github.com/centripetal/os/issues/1180", 60),
    row(lane, key, "Linear", "os-12", "Refactor device-tree overlay application", "Current code path doesn't handle overlay removal cleanly", "open", "active", null, 72),
    row(lane, key, "GitHub", "os-13", "DMA mapping API breaks on >4GB IOMMU apertures", "swiotlb fallback path doesn't respect aperture limits", "open", "active", "https://github.com/centripetal/os/issues/1175", 96),
    row(lane, key, "Linear", "os-14", "Power management C-state transition latency regression", "C3 exit takes 150us instead of expected 80us", "open", "active", null, 120),
    row(lane, key, "GitHub", "os-15", "Security: harden slab allocator against use-after-free", "Add quarantine and canary bytes to SLUB debug mode", "open", "active", "https://github.com/centripetal/os/issues/1170", 144),
    row(lane, key, "Linear", "os-16", "Documentation: update syscall ABI reference for v4.2", "23 new syscalls undocumented since last release", "open", "active", null, 168),
    row(lane, key, "GitHub", "os-17", "Interrupt affinity not restored after CPU hotplug", "IRQ balancer doesn't re-spread after online event", "open", "active", "https://github.com/centripetal/os/issues/1165", 200),
    row(lane, key, "Linear", "os-18", "Test harness: add fuzzing for VFS path resolution", "syzkaller configs don't cover new mount API", "open", "active", null, 240),
    row(lane, key, "GitHub", "os-19", "Real-time patch: deadline scheduler overshoot", "SCHED_DEADLINE misses period by up to 500us under contention", "open", "active", "https://github.com/centripetal/os/issues/1160", 300),
    row(lane, key, "Linear", "os-20", "Crypto subsystem: add AES-GCM-SIV acceleration", "Software fallback only — no hwaccel dispatch for Intel/ARM", "open", "active", null, 350),
    row(lane, key, "GitHub", "os-21", "Watchdog timeout on NVMe admin queue reset", "Controller reset path blocks for 30s if admin CQ full", "open", "active", "https://github.com/centripetal/os/issues/1155", 12),
    row(lane, key, "Linear", "os-22", "Tracing: ftrace buffer wrap loses events", "Ring buffer overwrite mode drops oldest events silently", "open", "active", null, 18),
    row(lane, key, "GitHub", "os-23", "GPU scheduler: fairness regression with multi-engine", "Render queue starves compute queue under mixed workloads", "in-progress", "active", "https://github.com/centripetal/os/issues/1150", 40),
    row(lane, key, "Linear", "os-24", "Boot time regression: +800ms from initramfs changes", "dracut module ordering adds unnecessary fsck wait", "open", "active", null, 55),
    row(lane, key, "GitHub", "os-25", "Networking: TCP RACK-TLP loss detection false positives", "Reordering window too narrow for satellite links", "open", "active", "https://github.com/centripetal/os/issues/1145", 70),
    row(lane, key, "Linear", "os-26", "Storage: NFS delegations not reclaimed after server restart", "Client holds stale delegations for 90s lease period", "open", "active", null, 85),
    row(lane, key, "GitHub", "os-27", "Scheduler: energy-aware balancing ignores thermal pressure", "EAS picks hot cores when cooler ones available", "open", "active", "https://github.com/centripetal/os/issues/1140", 100),
    row(lane, key, "Linear", "os-28", "Reliability: machine check handling for corrected errors", "CMCI storm floods kernel log, masks real UCEs", "open", "active", null, 130),
    row(lane, key, "GitHub", "os-29", "Container: cgroup v2 memory.high throttling too aggressive", "25% throughput drop at 80% limit", "open", "active", "https://github.com/centripetal/os/issues/1135", 160),
    row(lane, key, "Linear", "os-30", "CI: cross-compile farm flaky for MIPS targets", "Toolchain cache invalidation race on shared NFS", "open", "active", null, 190),
    row(lane, key, "GitHub", "os-31", "Virtualization: nested VMX perf regression", "L2 VM exit handling adds 2us per exit vs bare metal", "open", "active", "https://github.com/centripetal/os/issues/1130", 220),
    row(lane, key, "Linear", "os-32", "Networking: XDP redirect map lookup bottleneck", "Per-CPU map lock contention above 10Mpps", "open", "active", null, 260),
    row(lane, key, "GitHub", "os-33", "MM: THP (transparent huge pages) defrag stalls app", "khugepaged compaction blocks mmap for 50ms", "open", "active", "https://github.com/centripetal/os/issues/1125", 310),
  ];
  const held: MasterTodoRow[] = [
    row(lane, key, "GitHub", "os-h1", "Kernel module signing: key rotation breaks dkms", "Blocked on upstream dkms key management RFC", "blocked", "held", "https://github.com/centripetal/os/issues/1100", 500),
    row(lane, key, "Linear", "os-h2", "ARM64 pointer auth: kernel-mode PAC crashes on Cortex-X3", "Waiting for errata confirmation from ARM", "blocked", "held", null, 600),
    row(lane, key, "GitHub", "os-h3", "CXL memory tiering policy engine", "Spec 3.1 not final — holding implementation", "blocked", "held", "https://github.com/centripetal/os/issues/1095", 720),
    row(lane, key, "Linear", "os-h4", "Secure boot: revocation list update mechanism", "UEFI forum changing dbx format — waiting for resolution", "blocked", "held", null, 400),
    row(lane, key, "GitHub", "os-h5", "File locking: POSIX vs OFD lock interaction bugs", "Needs kernel-wide audit — parked until 4.3 cycle", "parked", "held", "https://github.com/centripetal/os/issues/1090", 800),
    row(lane, key, "Linear", "os-h6", "RDMA: RoCEv2 ECN marking inconsistent", "Switch vendor firmware fix required first", "blocked", "held", null, 550),
    row(lane, key, "GitHub", "os-h7", "Sound: USB audio gadget underruns on Raspberry Pi 5", "USB gadget stack rework scheduled for 4.3", "parked", "held", "https://github.com/centripetal/os/issues/1085", 650),
    row(lane, key, "Linear", "os-h8", "IPC: sysv shm segment limits not cgroup-aware", "Needs design review — low priority", "parked", "held", null, 900),
    row(lane, key, "GitHub", "os-h9", "Block layer: multi-actuator HDD support incomplete", "Only Seagate Mach.2 tested — need WD samples", "blocked", "held", "https://github.com/centripetal/os/issues/1080", 480),
    row(lane, key, "Linear", "os-h10", "WLAN: Wi-Fi 7 MLO roaming between APs", "802.11be D4.0 not ratified", "blocked", "held", null, 700),
    row(lane, key, "GitHub", "os-h11", "Debug: kgdb over USB-C broken after port mux changes", "Needs rework of usb_debug_port allocation", "parked", "held", "https://github.com/centripetal/os/issues/1075", 850),
    row(lane, key, "Linear", "os-h12", "Platform: Intel Lunar Lake S0ix residency <50%", "EC firmware update pending from Intel", "blocked", "held", null, 450),
    row(lane, key, "GitHub", "os-h13", "Testing: kselftest framework parallel execution broken", "TAP output interleaving — needs serialization rework", "parked", "held", "https://github.com/centripetal/os/issues/1070", 380),
    row(lane, key, "Linear", "os-h14", "Networking: AF_XDP zero-copy on virtio-net", "QEMU virtio changes landed — needs rebase", "blocked", "held", null, 530),
    row(lane, key, "GitHub", "os-h15", "Security: landlock filesystem access audit logging", "Audit subsystem capacity issue — see os-9", "blocked", "held", "https://github.com/centripetal/os/issues/1065", 620),
  ];
  return [...active, ...held];
}

function generateJetBrainsRows(): MasterTodoRow[] {
  const lane = "JetBrains Alliances";
  const key = "jetbrains";
  const rows: MasterTodoRow[] = [];
  const titles = [
    ["Renew IntelliJ Ultimate site license", "Annual renewal due — procurement needs PO"],
    ["Fleet IDE beta feedback consolidation", "Collect team impressions from 3-month pilot"],
    ["Kotlin Multiplatform adoption roadmap", "Draft migration plan for Android/iOS shared modules"],
    ["TeamCity pipeline migration from Jenkins", "Phase 2: move 47 remaining build configs"],
    ["Space integration: code review workflow", "Connect Space reviews to GitHub PR status checks"],
    ["ReSharper perf issues on large solutions", "150+ project solutions take 40s to open"],
    ["DataGrip license allocation audit", "12 unused seats identified in last quarter"],
    ["Qodana code quality gate setup", "Configure for CI — block PRs below B rating"],
    ["MPS language workbench evaluation", "DSL for policy rules — proof of concept phase"],
    ["Compose Multiplatform desktop app POC", "Evaluate for internal admin tooling replacement"],
    ["Ktor server framework migration", "Move 3 microservices from Spring Boot"],
    ["YouTrack workflow automation rules", "Auto-assign by component + SLA escalation"],
    ["Kotlin coroutines training materials", "Workshop content for backend team onboarding"],
    ["IntelliJ plugin: custom inspections", "Add company-specific code smell detectors"],
    ["Amper build system evaluation", "Compare with Gradle for new projects"],
    ["TeamCity cloud runners cost analysis", "On-prem vs cloud for ARM64 builds"],
    ["Gateway remote dev: latency benchmarks", "Test with US-East and EU-West dev servers"],
    ["Marketplace plugin submissions (3)", "Submit syntax highlighters for internal DSLs"],
    ["WebStorm → Fleet migration guide", "Document feature parity gaps for frontend team"],
    ["AI Assistant enterprise deployment", "On-prem LLM integration requirements"],
    ["Datalore notebook server setup", "Data science team needs shared workspace"],
    ["Kotlin/Native memory model migration", "Update legacy frozen-object patterns"],
    ["IntelliJ IDEA 2025.1 upgrade plan", "Test plugin compatibility before rollout"],
    ["JetBrains Academy licenses for interns", "10 seats needed for summer program"],
    ["Code With Me: security audit", "Review session data handling for compliance"],
    ["TeamCity Kotlin DSL standardization", "Create templates for common build patterns"],
    ["Rider Unity integration issues", "Debugger attach fails on Apple Silicon"],
    ["Exposed ORM evaluation", "Compare with Hibernate for new Kotlin services"],
    ["CI/CD: test impact analysis with TeamCity", "Only run affected tests on PR builds"],
    ["PhpStorm deprecation plan", "3 remaining PHP services to migrate"],
    ["Space documents → Notion migration", "Export 400+ design docs before contract end"],
    ["RustRover adoption for systems team", "Replace VS Code + rust-analyzer setup"],
    ["Hub SSO configuration update", "Add SAML 2.0 for new identity provider"],
    ["Profiler integration: async-profiler", "Add flame graph support to CI reports"],
    ["WebStorm ESLint flat config support", "Upgrade configs before v10 enforcement"],
    ["Toolbox App: managed installation", "GPO deployment for Windows workstations"],
    ["Writerside documentation platform", "Evaluate for public API docs hosting"],
  ];
  titles.forEach(([title, detail], i) => {
    rows.push(row(lane, key, i % 3 === 0 ? "YouTrack" : i % 3 === 1 ? "Linear" : "Jira", `jb-${i + 1}`, title, detail, i % 5 === 0 ? "in-progress" : "open", "active", null, 2 + i * 7));
  });
  return rows;
}

function generateTrafficRows(): MasterTodoRow[] {
  const lane = "Traffic Authority · Interchange";
  const key = "traffic";
  const titles: [string, string][] = [
    ["Signal timing optimization: US-287 corridor", "Peak-hour cycle length needs 15s extension northbound"],
    ["Interchange ramp metering firmware update", "v3.2 patch fixes ghost vehicle detection"],
    ["MUTCD sign compliance audit — Zone 4", "42 signs need retroreflectivity measurement"],
    ["Work zone ITS deployment: I-35W bridge", "CMS boards and queue detection for 6-month project"],
    ["Connected vehicle pilot: V2I at 5 intersections", "DSRC/C-V2X dual-mode RSU installation"],
    ["Pedestrian signal timing ADA review", "Walking speed assumption too fast for senior community"],
    ["Traffic count data integration with ODOT", "Harmonize AADT formatting for federal reporting"],
    ["Signal cabinet battery backup replacement", "14 cabinets past 5-year UPS lifecycle"],
    ["Left-turn phase evaluation: Main & 3rd", "5 angle crashes in 12 months — consider PPI"],
    ["School zone beacon maintenance", "Solar panel cleaning + firmware on 8 units"],
    ["Adaptive signal control pilot results", "6-month ASCT data ready for council presentation"],
    ["Emergency vehicle preemption audit", "Opticom receivers at 23 intersections need testing"],
    ["Pavement marking retroreflectivity survey", "Thermoplastic on arterials below 100 mcd/m2/lx"],
    ["Bike detection upgrade at 7 intersections", "Inductive loops missing bikes — add video detection"],
  ];
  return titles.map(([title, detail], i) =>
    row(lane, key, "Jira", `tr-${i + 1}`, title, detail, i === 1 ? "in-progress" : "open", "active", null, 4 + i * 12)
  );
}

function generateWellnessRows(): MasterTodoRow[] {
  const lane = "Fort Worth Wellness";
  const key = "wellness";
  const titles: [string, string][] = [
    ["Q3 wellness challenge platform setup", "Steps + hydration tracking for 200 participants"],
    ["Mental health first aid training schedule", "8-hour MHFA course — need 3 certified trainers"],
    ["Biometric screening vendor contract renewal", "Quest Diagnostics vs LabCorp pricing comparison"],
    ["EAP utilization report — June", "Usage up 12% — need anonymized summary for leadership"],
    ["Ergonomic assessment backlog", "23 pending requests from hybrid workers"],
    ["Flu shot clinic logistics — Fall 2025", "Book pharmacy partner + reserve 4 conference rooms"],
  ];
  return titles.map(([title, detail], i) =>
    row(lane, key, "Monday.com", `fw-${i + 1}`, title, detail, "open", "active", null, 6 + i * 24)
  );
}

function generateMineralRows(): MasterTodoRow[] {
  const lane = "CW Mineral · Oil & Gas";
  const key = "mineral";
  const titles: [string, string][] = [
    ["Royalty payment reconciliation Q2", "3 operators late on JIB statements — follow up"],
    ["Division order title opinion: Sec 14-T2N-R5E", "Curative needed — missing heir affidavit"],
    ["Lease expiration tracking: Permian Basin", "7 HBP leases need production verification"],
    ["Pooling election response: Kingfisher Co.", "OCC spacing order — 20-day deadline approaching"],
  ];
  return titles.map(([title, detail], i) =>
    row(lane, key, "Smartsheet", `cw-${i + 1}`, title, detail, i === 0 ? "in-progress" : "open", "active", null, 10 + i * 36)
  );
}

function generateSupportRows(): MasterTodoRow[] {
  const lane = "Support";
  const key = "support";
  const titles: [string, string][] = [
    ["Zendesk → Intercom migration cutover plan", "Phase 1: historical ticket export + tag mapping"],
    ["SLA breach root cause: 4 P1 tickets last week", "Alert routing misconfigured after on-call rotation change"],
    ["Knowledge base article refresh — top 20", "Outdated screenshots + broken links in onboarding category"],
  ];
  return titles.map(([title, detail], i) =>
    row(lane, key, "Intercom", `sup-${i + 1}`, title, detail, "open", "active", null, 3 + i * 18)
  );
}

function generateRemoteRows(): MasterTodoRow[] {
  return [
    row("Legal · LawDog", "legal", "Cube", "remote-legal", "Legal matters board lives on the Cube", "Legal matters board lives on the Cube — feed not wired yet", "remote", "remote", null, 0),
    row("Healthcare", "healthcare", "Linear", "remote-healthcare", "Tracked in Linear across two lanes", "Tracked in Linear across two lanes — feed not wired yet", "remote", "remote", null, 0),
  ];
}

export class MockMasterTodoSource implements MasterTodoSource {
  async listAll(): Promise<MasterTodoRow[]> {
    return [
      ...generateOSRows(),
      ...generateMineralRows(),
      ...generateRemoteRows(),
      ...generateJetBrainsRows(),
      ...generateTrafficRows(),
      ...generateWellnessRows(),
      ...generateSupportRows(),
    ];
  }
}
