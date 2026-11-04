// Optional Roleplay Tools API v1 bridge; either extension may load first.
export function isRoleplayDocked(element) { return element?.dataset.rptDocked === 'true'; }
export function registerRoleplayPanel(descriptor) {
    const connect = () => {
        const host = window.WaniRoleplayTools;
        if (host?.version !== 1) return;
        try { host.register(descriptor); }
        catch (error) { console.warn('[Character Stats] Roleplay Tools registration failed', error); }
    };
    window.addEventListener('wani-roleplay-tools:ready', connect);
    connect();
}
