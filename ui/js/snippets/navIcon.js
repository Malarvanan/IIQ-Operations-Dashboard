/**
 * IIQ Ops Dashboard — navIcon.js (Snippet)
 * Injected on every IIQ page for users with the ViewIIQOpsDashboard SPRight.
 * Adds a tachometer icon to the top navigation bar linking to the dashboard.
 */
(function () {
    var url = SailPoint.CONTEXT_PATH + '/plugins/pluginPage.jsf?pn=IIQOpsDashboard';

    jQuery(document).ready(function () {
        jQuery('ul.navbar-right li:first').before(
            '<li class="dropdown" id="iiq-ops-nav-icon">' +
            '  <a href="' + url + '" tabindex="0" role="menuitem" title="IIQ Ops Dashboard"' +
            '     style="color:#38bdf8;padding:15px 12px;display:inline-block;">' +
            '    <i class="fa fa-tachometer fa-lg" aria-hidden="true"></i>' +
            '  </a>' +
            '</li>'
        );
    });
})();
