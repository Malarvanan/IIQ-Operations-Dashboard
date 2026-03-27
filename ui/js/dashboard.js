/**
 * IIQ Ops Dashboard — dashboard.js v6.0
 * - White/SailPoint native UI
 * - CSV download per panel (respects current date filter, fetches ALL records)
 * - No Task Results / Prov Transactions links
 */

// ---------------------------------------------------------------------------
// Base URL — /plugin/rest/ confirmed from Impersonate Plugin source
// ---------------------------------------------------------------------------
var IQD_BASE = (function () {
    var ctx = (typeof SailPoint !== 'undefined' && SailPoint.CONTEXT_PATH)
        ? SailPoint.CONTEXT_PATH : '/identityiq';
    return ctx.replace(/\/$/, '') + '/plugin/rest/iiqopsdashboard';
}());

var IQD_MAX_ROWS     = 100;   // rows shown in UI
var IQD_CSV_MAX      = 9999;  // rows fetched for CSV (effectively all)
var IQD_REFRESH_SECS = 60;
var IQD_REFRESH_TIMER = null;

// In-memory cache of last fetched data for each panel (for CSV)
var IQD_CACHE = { joiner: null, leaver: null, agg: null, prov: null };

// ---------------------------------------------------------------------------
// CSRF — read from CSRF-TOKEN cookie (confirmed from Impersonate Plugin)
// ---------------------------------------------------------------------------
function iqd_getCsrfToken() {
    var m = document.cookie.match(/(?:^|;\s*)CSRF-TOKEN=([^;]+)/);
    if (m && m[1]) return decodeURIComponent(m[1]);
    var m2 = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
    if (m2 && m2[1]) return decodeURIComponent(m2[1]);
    if (typeof IQD_CSRF_TOKEN !== 'undefined' && IQD_CSRF_TOKEN &&
            IQD_CSRF_TOKEN !== 'null' && IQD_CSRF_TOKEN.length > 0)
        return IQD_CSRF_TOKEN;
    return null;
}

// ---------------------------------------------------------------------------
// Filter readers
// ---------------------------------------------------------------------------
function getFrom()   { var e = document.getElementById('filter-from');   return e ? e.value : ''; }
function getTo()     { var e = document.getElementById('filter-to');     return e ? e.value : ''; }
function getType()   { var e = document.getElementById('filter-type');   return e ? e.value : 'all'; }
function getStatus() { var e = document.getElementById('filter-status'); return e ? e.value : 'all'; }

function iqd_qs(extra) {
    var parts = [];
    var from = getFrom(), to = getTo();
    if (from) parts.push('from=' + encodeURIComponent(from));
    if (to)   parts.push('to='   + encodeURIComponent(to));
    if (extra) {
        for (var k in extra) {
            if (Object.prototype.hasOwnProperty.call(extra, k))
                parts.push(k + '=' + encodeURIComponent(extra[k]));
        }
    }
    return parts.length ? '?' + parts.join('&') : '';
}

// ---------------------------------------------------------------------------
// Range badge
// ---------------------------------------------------------------------------
function iqd_updateRangeBadge() {
    var el = document.getElementById('iqd-range-badge');
    if (!el) return;
    var from = getFrom(), to = getTo();
    if (!from && !to) {
        el.textContent = 'Today';
        el.className = 'iqd-range-badge';
    } else if (from && !to) {
        el.textContent = iqd_fmtLabel(from);
        el.className = 'iqd-range-badge iqd-range-badge-active';
    } else {
        el.textContent = iqd_fmtLabel(from) + '  \u2192  ' + iqd_fmtLabel(to);
        el.className = 'iqd-range-badge iqd-range-badge-active';
    }
}

function iqd_fmtLabel(yyyymmdd) {
    if (!yyyymmdd) return '';
    var p = yyyymmdd.split('-');
    if (p.length !== 3) return yyyymmdd;
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return p[2] + ' ' + (months[parseInt(p[1], 10) - 1] || p[1]) + ' ' + p[0];
}

// ---------------------------------------------------------------------------
// Filter change handlers
// ---------------------------------------------------------------------------
function onFilterChange() { loadAll(); }

function clearDates() {
    var f = document.getElementById('filter-from');
    var t = document.getElementById('filter-to');
    if (f) f.value = '';
    if (t) t.value = '';
    loadAll();
}

// ---------------------------------------------------------------------------
// Auto-refresh
// ---------------------------------------------------------------------------
function iqd_startAutoRefresh() {
    iqd_stopAutoRefresh();
    if (IQD_REFRESH_SECS > 0) {
        IQD_REFRESH_TIMER = setInterval(function () { loadAll(); }, IQD_REFRESH_SECS * 1000);
        iqd_updateRefreshLabel();
    }
}
function iqd_stopAutoRefresh() {
    if (IQD_REFRESH_TIMER) { clearInterval(IQD_REFRESH_TIMER); IQD_REFRESH_TIMER = null; }
}
function iqd_updateRefreshLabel() {
    var el = document.getElementById('iqd-refresh-label');
    if (!el) return;
    if (IQD_REFRESH_SECS > 0 && IQD_REFRESH_TIMER) {
        el.textContent = 'Auto \u21bb ' + IQD_REFRESH_SECS + 's';
        el.className = 'iqd-refresh-label iqd-refresh-label-on';
    } else {
        el.textContent = 'Auto-refresh off';
        el.className = 'iqd-refresh-label';
    }
}
function toggleAutoRefresh() {
    if (IQD_REFRESH_TIMER) { iqd_stopAutoRefresh(); iqd_updateRefreshLabel(); }
    else { IQD_REFRESH_SECS = 60; iqd_startAutoRefresh(); }
}

// ---------------------------------------------------------------------------
// XHR helper
// ---------------------------------------------------------------------------
function iqd_apiFetch(path, cb) {
    var url = IQD_BASE + path;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
    var token = iqd_getCsrfToken();
    if (token) xhr.setRequestHeader('X-XSRF-TOKEN', token);

    xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 200) {
            var text = xhr.responseText || '';
            if (text.trim().charAt(0) === '<') {
                if (text.indexOf('System Exception') !== -1)
                    cb('IIQ System Exception — check server log for incident code.', null);
                else if (text.indexOf('login') !== -1 || text.indexOf('Login') !== -1)
                    cb('Session expired — please reload and log in again.', null);
                else
                    cb('Server returned HTML instead of JSON.', null);
                return;
            }
            try { cb(null, JSON.parse(text)); }
            catch (e) { cb('JSON parse error: ' + e.message, null); }
        } else if (xhr.status === 403) {
            cb('CSRF error (403) — token: ' + (token ? token.substring(0,12)+'...' : 'NOT FOUND'), null);
        } else if (xhr.status === 401) {
            cb('Not authenticated (401) — please reload.', null);
        } else if (xhr.status === 0) {
            cb('Request blocked or network error.', null);
        } else {
            cb('HTTP ' + xhr.status + ' — ' + url, null);
        }
    };
    xhr.send();
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function iqd_esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function iqd_fmtDate(epoch) {
    if (!epoch) return '-';
    var d = new Date(epoch);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return p(d.getDate()) + '/' + p(d.getMonth()+1) + '/' + d.getFullYear()
         + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}
function iqd_fmtDateCsv(epoch) {
    if (!epoch) return '';
    var d = new Date(epoch);
    var p = function (n) { return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate())
         + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function iqd_statusBadge(cs, failed) {
    if (failed || /error|terminated/i.test(cs || ''))
        return '<span class="iqd-badge iqd-badge-fail">Failed</span>';
    if (/success/i.test(cs || ''))
        return '<span class="iqd-badge iqd-badge-success">Success</span>';
    if (/warning/i.test(cs || ''))
        return '<span class="iqd-badge iqd-badge-warning">Warning</span>';
    return '<span class="iqd-badge iqd-badge-running">Running</span>';
}
function iqd_setText(id, v) {
    var e = document.getElementById(id);
    if (e) e.textContent = (v !== undefined && v !== null) ? String(v) : '-';
}
function iqd_setCount(id, total, failed) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = failed > 0 ? total + ' (' + failed + ' failed)' : String(total);
    el.className = failed > 0 ? 'iqd-panel-count iqd-count-fail' : 'iqd-panel-count';
}
function iqd_setLoading(id, cols) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<tr><td colspan="' + cols + '" class="iqd-cell-loading">Loading&#8230;</td></tr>';
}
function iqd_showTableError(id, cols, msg) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<tr><td colspan="' + cols + '" class="iqd-cell-error">' + iqd_esc(msg) + '</td></tr>';
}
function iqd_setEmpty(id, cols) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<tr><td colspan="' + cols + '" class="iqd-cell-empty">No records found for this date range.</td></tr>';
}

// ---------------------------------------------------------------------------
// CSV Download — fetches ALL records (max=9999) then triggers download
// ---------------------------------------------------------------------------
function iqd_csvEscape(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1)
        return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

function iqd_triggerCsvDownload(filename, rows) {
    var blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

function iqd_downloadCsv(panel) {
    var btn = document.getElementById('csv-' + panel);
    if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }

    var dateTag = (getFrom() || 'today').replace(/-/g,'') + (getTo() ? '_to_' + getTo().replace(/-/g,'') : '');
    var status = getStatus();

    function done(btn, label) {
        if (btn) { btn.disabled = false; btn.textContent = label; }
    }

    if (panel === 'joiner' || panel === 'leaver') {
        var path = '/jml' + iqd_qs({ type: panel, status: status, max: IQD_CSV_MAX });
        iqd_apiFetch(path, function (err, data) {
            if (err || !data) { alert('CSV download failed: ' + (err || 'no data')); done(btn, '\u2193 CSV'); return; }
            var lines = ['Identity,Task Name,Completed,Status'];
            for (var i = 0; i < data.length; i++) {
                var r = data[i];
                lines.push([
                    iqd_csvEscape(r.identity),
                    iqd_csvEscape(r.taskName),
                    iqd_csvEscape(iqd_fmtDateCsv(r.completed)),
                    iqd_csvEscape(r.failed ? 'Failed' : (r.completionStatus || ''))
                ].join(','));
            }
            iqd_triggerCsvDownload('iqd_' + panel + '_' + dateTag + '.csv', lines.join('\r\n'));
            done(btn, '\u2193 CSV');
        });

    } else if (panel === 'agg') {
        var path2 = '/aggregation' + iqd_qs({ status: status, max: IQD_CSV_MAX });
        iqd_apiFetch(path2, function (err, data) {
            if (err || !data) { alert('CSV download failed: ' + (err || 'no data')); done(btn, '\u2193 CSV'); return; }
            var lines = ['Task Name,Completed,Status'];
            for (var i = 0; i < data.length; i++) {
                var r = data[i];
                lines.push([
                    iqd_csvEscape(r.taskName),
                    iqd_csvEscape(iqd_fmtDateCsv(r.completed)),
                    iqd_csvEscape(r.failed ? 'Failed' : (r.completionStatus || ''))
                ].join(','));
            }
            iqd_triggerCsvDownload('iqd_aggregation_' + dateTag + '.csv', lines.join('\r\n'));
            done(btn, '\u2193 CSV');
        });

    } else if (panel === 'prov') {
        var path3 = '/provisioning' + iqd_qs({ max: IQD_CSV_MAX });
        iqd_apiFetch(path3, function (err, data) {
            if (err || !data) { alert('CSV download failed: ' + (err || 'no data')); done(btn, '\u2193 CSV'); return; }
            var lines = ['Identity,Application,Operation,Time,Forced,Source'];
            for (var i = 0; i < data.length; i++) {
                var r = data[i];
                lines.push([
                    iqd_csvEscape(r.identity),
                    iqd_csvEscape(r.application),
                    iqd_csvEscape(r.operation),
                    iqd_csvEscape(iqd_fmtDateCsv(r.created)),
                    iqd_csvEscape(r.forced ? 'Yes' : 'No'),
                    iqd_csvEscape(r.source || '')
                ].join(','));
            }
            iqd_triggerCsvDownload('iqd_provisioning_failures_' + dateTag + '.csv', lines.join('\r\n'));
            done(btn, '\u2193 CSV');
        });
    }
}

// ---------------------------------------------------------------------------
// Render: KPI Summary
// ---------------------------------------------------------------------------
function iqd_renderSummary(d) {
    iqd_setText('kpi-joiners',      d.joiners       != null ? d.joiners       : '-');
    iqd_setText('kpi-joiners-fail', d.joinersFailed != null ? d.joinersFailed : '-');
    iqd_setText('kpi-leavers',      d.leavers       != null ? d.leavers       : '-');
    iqd_setText('kpi-leavers-fail', d.leaversFailed != null ? d.leaversFailed : '-');
    iqd_setText('kpi-agg',          d.aggTotal      != null ? d.aggTotal      : '-');
    iqd_setText('kpi-agg-fail',     d.aggFailed     != null ? d.aggFailed     : '-');
    iqd_setText('kpi-failures',     d.totalFailures != null ? d.totalFailures : '-');
    iqd_setText('kpi-failures-sub',
        (d.joinersFailed || 0) + ' jml + ' + (d.aggFailed || 0) + ' agg + ' + (d.provFailures || 0) + ' prov');
}

// ---------------------------------------------------------------------------
// Render: JML table
// ---------------------------------------------------------------------------
function iqd_renderJmlTable(tbodyId, countId, rows) {
    if (!rows || rows.length === 0) {
        iqd_setEmpty(tbodyId, 4);
        iqd_setText(countId, '0');
        return;
    }
    var failed = rows.filter(function (r) { return r.failed; }).length;
    iqd_setCount(countId, rows.length, failed);
    var html = '';
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        html += '<tr' + (r.failed ? ' class="iqd-row-fail"' : '') + '>'
              + '<td class="iqd-cell-identity">' + iqd_esc(r.identity || '-') + '</td>'
              + '<td class="iqd-cell-task" title="' + iqd_esc(r.taskName) + '">' + iqd_esc(r.taskName || '-') + '</td>'
              + '<td class="iqd-cell-time">' + iqd_fmtDate(r.completed) + '</td>'
              + '<td>' + iqd_statusBadge(r.completionStatus, r.failed) + '</td>'
              + '</tr>';
    }
    document.getElementById(tbodyId).innerHTML = html;
}

// ---------------------------------------------------------------------------
// Render: Aggregation table
// ---------------------------------------------------------------------------
function iqd_renderAgg(rows) {
    if (!rows || rows.length === 0) {
        iqd_setEmpty('agg-body', 3);
        iqd_setText('agg-count', '0');
        return;
    }
    var failed = rows.filter(function (r) { return r.failed; }).length;
    iqd_setCount('agg-count', rows.length, failed);
    var html = '';
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        html += '<tr' + (r.failed ? ' class="iqd-row-fail"' : '') + '>'
              + '<td class="iqd-cell-identity" title="' + iqd_esc(r.taskName) + '">' + iqd_esc(r.taskName || '-') + '</td>'
              + '<td class="iqd-cell-time">' + iqd_fmtDate(r.completed) + '</td>'
              + '<td>' + iqd_statusBadge(r.completionStatus, r.failed) + '</td>'
              + '</tr>';
    }
    document.getElementById('agg-body').innerHTML = html;
}

// ---------------------------------------------------------------------------
// Render: Provisioning failures
// ---------------------------------------------------------------------------
function iqd_renderProv(rows) {
    var ct = document.getElementById('prov-count');
    if (!rows || rows.length === 0) {
        iqd_setEmpty('prov-body', 4);
        if (ct) { ct.textContent = '0'; ct.className = 'iqd-panel-count'; }
        return;
    }
    if (ct) { ct.textContent = String(rows.length); ct.className = 'iqd-panel-count iqd-count-fail'; }
    var html = '';
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var forced = r.forced ? ' <span class="iqd-badge iqd-badge-warning">Forced</span>' : '';
        html += '<tr class="iqd-row-fail">'
              + '<td class="iqd-cell-identity">' + iqd_esc(r.identity    || '-') + '</td>'
              + '<td class="iqd-cell-app">'      + iqd_esc(r.application || '-') + '</td>'
              + '<td class="iqd-cell-op">'       + iqd_esc(r.operation   || '-') + forced + '</td>'
              + '<td class="iqd-cell-time">'     + iqd_fmtDate(r.created)        + '</td>'
              + '</tr>';
    }
    document.getElementById('prov-body').innerHTML = html;
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------
function iqd_loadSummary() {
    iqd_apiFetch('/summary' + iqd_qs(), function (err, data) {
        if (!err && data) iqd_renderSummary(data);
    });
}

function loadJml() {
    var type   = getType();
    var status = getStatus();
    var showJ  = type === 'all' || type === 'joiner';
    var showL  = type === 'all' || type === 'leaver';

    if (showJ) {
        iqd_setLoading('joiner-body', 4);
        iqd_apiFetch('/jml' + iqd_qs({ type: 'joiner', status: status, max: IQD_MAX_ROWS }), function (err, data) {
            if (err) { console.error('[IIQOpsDashboard] Joiner error:', err); iqd_showTableError('joiner-body', 4, err); }
            else iqd_renderJmlTable('joiner-body', 'joiner-count', data);
        });
    } else { iqd_setEmpty('joiner-body', 4); }

    if (showL) {
        iqd_setLoading('leaver-body', 4);
        iqd_apiFetch('/jml' + iqd_qs({ type: 'leaver', status: status, max: IQD_MAX_ROWS }), function (err, data) {
            if (err) { console.error('[IIQOpsDashboard] Leaver error:', err); iqd_showTableError('leaver-body', 4, err); }
            else iqd_renderJmlTable('leaver-body', 'leaver-count', data);
        });
    } else { iqd_setEmpty('leaver-body', 4); }
}

function iqd_loadAgg() {
    iqd_setLoading('agg-body', 3);
    iqd_apiFetch('/aggregation' + iqd_qs({ status: getStatus(), max: IQD_MAX_ROWS }), function (err, data) {
        if (err) { console.error('[IIQOpsDashboard] Agg error:', err); iqd_showTableError('agg-body', 3, err); }
        else iqd_renderAgg(data);
    });
}

function iqd_loadProv() {
    iqd_setLoading('prov-body', 4);
    iqd_apiFetch('/provisioning' + iqd_qs({ max: IQD_MAX_ROWS }), function (err, data) {
        if (err) { console.error('[IIQOpsDashboard] Prov error:', err); iqd_showTableError('prov-body', 4, err); }
        else iqd_renderProv(data);
    });
}

function loadAll() {
    iqd_updateRangeBadge();
    iqd_loadSummary();
    loadJml();
    iqd_loadAgg();
    iqd_loadProv();
    var ts = document.getElementById('iqd-last-updated');
    if (ts) {
        var n = new Date();
        var p = function (x) { return x < 10 ? '0' + x : '' + x; };
        ts.textContent = 'Updated ' + p(n.getHours()) + ':' + p(n.getMinutes()) + ':' + p(n.getSeconds());
    }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { loadAll(); iqd_startAutoRefresh(); });
} else {
    loadAll();
    iqd_startAutoRefresh();
}
