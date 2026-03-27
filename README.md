# IIQ Ops Dashboard

A SailPoint IdentityIQ plugin that provides a real-time operations dashboard for monitoring Joiner/Leaver (JML) events, Aggregation Tasks, and Provisioning Failures — all in one place.

![IIQ Ops Dashboard](https://img.shields.io/badge/IIQ-8.5-blue) ![Version](https://img.shields.io/badge/version-6.1-green) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Features

- **Joiner & Leaver Events** — real-time view of lifecycle task results with identity, task name, completion time and status
- **Aggregation Tasks** — monitor all aggregation task results with pass/fail status
- **Provisioning Failures** — track failed provisioning transactions by identity, application and operation
- **KPI Summary Tiles** — at-a-glance counts of joiners, leavers, aggregations and total failures
- **Date Range Filter** — filter all panels by date range with a Today shortcut
- **JML Type & Status Filter** — filter by Joiner/Leaver and Success/Failed
- **CSV Export** — download all records per panel as CSV (respects current date filter)
- **Auto Refresh** — configurable auto-refresh every 60 seconds

---

## Requirements

| Component | Version |
|---|---|
| SailPoint IdentityIQ | 8.5 (Build fb6698fe9f4) |
| Java | 11+ (bundled with IIQ) |

---

## Installation

1. Log into IdentityIQ as System Administrator
2. Go to **Plugins**
3. Click **New Plugin**
4. Upload `IIQOpsDashboard.zip`
5. Navigate to the plugin via the nav icon 

> **Upgrade from previous version:** Uninstall the old version first, then install the new one.

---

## Usage

### Accessing the Dashboard
After installation, a nav icon appears in the IIQ header. Click it to open the dashboard.

Alternatively, navigate directly to:
```
http://YOUR_IIQ_HOST/identityiq/plugin/IIQOpsDashboard/ui/page.jsf
```

### Date Filtering
- Leave dates blank to see **today's** records
- Set **From** and **To** dates to filter any range
- Click **× Clear (Today)** to reset to today

### CSV Export
Each panel has a **↓ CSV** button. Clicking it fetches **all records** matching the current date filter (not just the 100 shown in the UI) and downloads a CSV file named:
```
iqd_joiner_20260101_to_20260326.csv
iqd_leaver_20260101_to_20260326.csv
iqd_aggregation_20260101_to_20260326.csv
iqd_provisioning_failures_20260101_to_20260326.csv
```

### How Data is Pulled

| Panel | Source | Filter |
|---|---|---|
| Joiner Events | `TaskResult` | name contains `joiner:` (case-insensitive) |
| Leaver Events | `TaskResult` | name contains `leaver:` (case-insensitive) |
| Aggregation Tasks | `TaskResult` | name contains `aggregation` (case-insensitive) |
| Provisioning Failures | `ProvisioningTransaction` | status = `Failed` |

### Failure Detection
A task is counted as **failed** when its `CompletionStatus` is `Error` or `Terminated`.

| Status | UI Badge | Counted as Failure |
|---|---|---|
| Success | 🟢 Success | No |
| Warning | 🟡 Warning | No |
| Error | 🔴 Failed | Yes |
| Terminated | 🔴 Failed | Yes |
| TempError | 🔵 Running | No |

---

## Project Structure

```
iiq-ops-dashboard/
├── README.md
├── manifest.xml                          # Plugin manifest (version, REST resources, rights)
├── jars/
│   └── IIQOpsDashboard.jar               # Compiled plugin REST resource
├── ui/
│   ├── page.xhtml                        # JSF page (CSRF token injection, layout)
│   ├── css/
│   │   └── dashboard.css                 # SailPoint-native styles
│   └── js/
│       ├── dashboard.js                  # Main dashboard logic + CSV export
│       └── snippets/
│           └── navIcon.js                # Navigation bar icon injection
├── import/
│   ├── install/
│   │   └── SPRight-ViewIIQOpsDashboard.xml   # Right definition (install)
│   └── upgrade/
│       └── SPRight-ViewIIQOpsDashboard.xml   # Right definition (upgrade)
└── config/
    └── SPRight-ViewIIQOpsDashboard.xml       # Right configuration
```

---

## Configuration

Plugin settings are available under **Plugins → IIQ Ops Dashboard → Settings**:

| Setting | Default | Description |
|---|---|---|
| Refresh Interval | 60 seconds | Auto-refresh interval (0 = disabled) |
| Max Rows Per Panel | 100 | Max rows shown in UI per panel |

---

## API Endpoints

The plugin exposes these REST endpoints under `/identityiq/plugin/rest/iiqopsdashboard/`:

| Endpoint | Params | Description |
|---|---|---|
| `GET /summary` | `from`, `to` | KPI counts for all panels |
| `GET /jml` | `from`, `to`, `type`, `status`, `max` | JML task results |
| `GET /aggregation` | `from`, `to`, `status`, `max` | Aggregation task results |
| `GET /provisioning` | `from`, `to`, `max` | Provisioning failures |

All endpoints require an authenticated IIQ session and `X-XSRF-TOKEN` header.

---

## License

MIT License — free to use, modify and distribute.

---

## Author

Built for SailPoint IdentityIQ 8.5 operations monitoring.
