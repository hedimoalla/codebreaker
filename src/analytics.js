/**
 * analytics.js — lightweight event tracking abstraction.
 *
 * This ships as a real, working local event log (visible in DevTools console
 * and inspectable via ANALYTICS.getEvents()). It intentionally does NOT call
 * out to any real analytics backend, because none is configured for this
 * project. Two concrete integration points are marked TODO below:
 *
 *   1. Steam: wire into Steamworks User Stats / Achievements via a native
 *      binding such as `steamworks.js` or Greenworks from the Electron main
 *      process (IPC the event over, mirroring the storage:get/set pattern
 *      in main.js), calling ISteamUserStats::SetStat / SetAchievement /
 *      StoreStats.
 *   2. Mobile/Web: point ANALYTICS.configure({ endpoint, appId }) at a real
 *      collector (Firebase Analytics, PostHog, Amplitude, etc.) — flush()
 *      already batches events, it just needs a real fetch() target.
 */
(function (root) {
  const MAX_BUFFERED_EVENTS = 500;

  const state = {
    enabled: false,
    endpoint: null,
    sessionId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    queue: [],
    allEvents: []
  };

  function track(name, params = {}) {
    const event = {
      name,
      params,
      ts: Date.now(),
      sessionId: state.sessionId
    };
    state.allEvents.push(event);
    if (state.allEvents.length > MAX_BUFFERED_EVENTS) state.allEvents.shift();

    if (state.enabled) {
      state.queue.push(event);
      if (state.queue.length >= 20) flush();
    }

    if (state.debug) {
      // eslint-disable-next-line no-console
      console.log(`[Analytics] ${name}`, params);
    }
  }

  async function flush() {
    if (!state.enabled || state.queue.length === 0) return;
    const batch = state.queue.splice(0, state.queue.length);
    if (!state.endpoint) {
      console.log(`[Analytics] (sandbox) would send ${batch.length} event(s) — no endpoint configured`);
      return;
    }
    try {
      await fetch(state.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: state.sessionId, events: batch })
      });
    } catch (err) {
      console.warn('[Analytics] flush failed, re-queueing', err);
      state.queue.unshift(...batch);
    }
  }

  function configure({ enabled = false, endpoint = null, debug = false } = {}) {
    state.enabled = Boolean(enabled);
    state.endpoint = endpoint;
    state.debug = Boolean(debug);
  }

  const ANALYTICS = {
    configure,
    track,
    flush,
    getEvents: () => state.allEvents.slice(),
    getSessionId: () => state.sessionId
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ANALYTICS;
  } else {
    root.ANALYTICS = ANALYTICS;
  }
})(typeof window !== 'undefined' ? window : globalThis);
