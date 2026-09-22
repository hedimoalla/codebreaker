/**
 * supabase-client.js — Supabase client wrapper using REST API directly.
 * Handles anonymous sign-in, profile sync, and (later) Google sign-in.
 */
(function (root) {
  'use strict';

  const PROJECT_URL = 'https://uimdsuuroysqajtulthx.supabase.co';
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpbWRzdXVyb3lzcWFqdHVsdGh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MTQyODcsImV4cCI6MjEwNTQ5MDI4N30.F73d3BRq5uhT9uVB9DlewBL2Da8w1nMhdJa587JX6Y0';

  let session = null;

  async function authFetch(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      ...options.headers
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    const response = await fetch(`${PROJECT_URL}${endpoint}`, {
      ...options,
      headers
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }
    return response.json();
  }

  async function signInAnonymously() {
    const data = await authFetch('/auth/v1/signup', {
      method: 'POST',
      body: JSON.stringify({ data: {} })
    });
    session = data.session;
    localStorage.setItem('supabase_session', JSON.stringify(session));
    return session;
  }

  async function getSession() {
    // Try to restore from localStorage first
    if (!session) {
      const stored = localStorage.getItem('supabase_session');
      if (stored) {
        try {
          session = JSON.parse(stored);
        } catch {
          localStorage.removeItem('supabase_session');
        }
      }
    }
    return session;
  }

  async function signOut() {
    const token = session?.access_token;
    if (token) {
      try {
        await authFetch('/auth/v1/logout', {
          method: 'POST'
        });
      } catch {
        // Ignore errors on logout
      }
    }
    session = null;
    localStorage.removeItem('supabase_session');
  }

  async function fetchProfile() {
    const sess = session || (await getSession());
    if (!sess) return null;

    try {
      const data = await authFetch(`/rest/v1/profiles?id=eq.${sess.user.id}&select=*`, {
        method: 'GET'
      });
      return data && data.length > 0 ? data[0] : null;
    } catch (err) {
      console.warn('Profile fetch failed:', err.message);
      return null;
    }
  }

  async function upsertProfile(profileData) {
    const sess = session || (await getSession());
    if (!sess) throw new Error('No session — sign in first');

    const payload = {
      id: sess.user.id,
      ...profileData,
      updated_at: new Date().toISOString()
    };

    const data = await authFetch('/rest/v1/profiles?on_conflict=id&select=*', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return data && data.length > 0 ? data[0] : null;
  }

  async function fetchLeaderboard(difficulty, language = 'en') {
    try {
      const data = await authFetch(
        `/rest/v1/leaderboard?difficulty=eq.${difficulty}&language=eq.${language}&order=best_round.desc&limit=50`,
        { method: 'GET' }
      );
      return data || [];
    } catch (err) {
      console.warn('Leaderboard fetch failed:', err.message);
      return [];
    }
  }

  async function getDailyChallenge(language = 'en') {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const data = await authFetch(
        `/rest/v1/daily_challenges?date=eq.${today}&lang=eq.${language}&select=word`,
        { method: 'GET' }
      );
      return (data && data.length > 0) ? data[0].word : null;
    } catch (err) {
      console.warn('Daily challenge fetch failed:', err.message);
      return null;
    }
  }

  async function updateDailyStats(streak, bestRound) {
    const sess = session || (await getSession());
    if (!sess) return null;

    const today = new Date().toISOString().split('T')[0];
    return upsertProfile({
      daily_streak: streak,
      last_daily_play_date: today,
      daily_best_round: bestRound
    });
  }

  const SupabaseClient = {
    signInAnonymously,
    getSession,
    signOut,
    fetchProfile,
    upsertProfile,
    fetchLeaderboard,
    getDailyChallenge,
    updateDailyStats
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = SupabaseClient;
  } else {
    root.SupabaseClient = SupabaseClient;
  }
})(typeof window !== 'undefined' ? window : globalThis);
