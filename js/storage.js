// Remote + local fallback storage adapter
(function () {
  const REMOTE_ENDPOINT =
    window.SMOOTHIEFICATOR_STORAGE_ENDPOINT || "/api/songs.php";
  const TRANSPORT_ENDPOINT =
    window.SMOOTHIEFICATOR_TRANSPORT_ENDPOINT || "/api/transport.php";
  const LOCAL_CACHE_KEY = "savedSongs";
  const REQUEST_TIMEOUT_MS = 8000;

  function normalizeSongs(input) {
    if (!input || typeof input !== "object") {
      return {};
    }

    // New format: { songs: {...}, updatedAt: "..." }
    if (input.songs && typeof input.songs === "object") {
      return input.songs;
    }

    // Legacy format: { "<id>": song, ... }
    return input;
  }

  function readLocalCache() {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_CACHE_KEY) || "{}");
    } catch (error) {
      console.warn("Could not parse local cache, resetting.", error);
      return {};
    }
  }

  function writeLocalCache(songs) {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(songs || {}));
  }

  function withTimeout(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
  }

  function setSyncStatus(message, type) {
    const statusElement = document.getElementById("sync-status");
    if (!statusElement) return;

    statusElement.textContent = message;
    statusElement.dataset.state = type || "idle";
    statusElement.classList.remove("hidden");
  }

  function setTransportSyncStatus(message, type) {
    const statusElement = document.getElementById("transport-sync-status");
    if (!statusElement) return;

    statusElement.textContent = message;
    statusElement.dataset.state = type || "idle";
    statusElement.classList.remove("hidden");
  }

  function setMissingSongSyncStatus(songId) {
    const shortId = (songId || "").toString().slice(0, 20);
    setTransportSyncStatus(`Song missing on this device (${shortId})`, "warning");
  }

  function setTransportControlStatus(state) {
    // Scroll row = connection/control action; role text lives on Control row.
    if (state === "taking") {
      setTransportSyncStatus("Taking control…", "saving");
      return;
    }
    if (state === "acquired") {
      setTransportSyncStatus("Scroll sync live", "ok");
      return;
    }
    if (state === "following") {
      setTransportSyncStatus("Scroll sync live", "ok");
    }
  }

  async function loadSongs() {
    const { controller, timer } = withTimeout(REQUEST_TIMEOUT_MS);

    try {
      setSyncStatus("Syncing library…", "saving");

      const response = await fetch(REMOTE_ENDPOINT, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Remote load failed (${response.status})`);
      }

      const payload = await response.json();
      const songs = normalizeSongs(payload);
      writeLocalCache(songs);
      setSyncStatus("Library synced", "ok");
      return songs;
    } catch (error) {
      console.warn("Remote load failed, using local cache.", error);
      setSyncStatus("Offline — local cache only", "warning");
      return readLocalCache();
    } finally {
      clearTimeout(timer);
    }
  }

  async function saveSongs(songs) {
    const songsToSave = songs || {};
    const payload = {
      songs: songsToSave,
      updatedAt: new Date().toISOString(),
    };

    writeLocalCache(songsToSave);
    setSyncStatus("Saving library…", "saving");

    const { controller, timer } = withTimeout(REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(REMOTE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Remote save failed (${response.status})`);
      }

      setSyncStatus("Library synced", "ok");
      return true;
    } catch (error) {
      console.warn("Remote save failed, local cache updated only.", error);
      setSyncStatus("Save failed — local only", "error");
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async function loadTransportState() {
    const { controller, timer } = withTimeout(REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(TRANSPORT_ENDPOINT, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Transport load failed (${response.status})`);
      }

      const payload = await response.json();
      setTransportSyncStatus("Scroll sync live", "ok");
      return payload;
    } catch (error) {
      console.warn("Transport load failed.", error);
      setTransportSyncStatus("Reconnecting scroll sync…", "warning");
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function saveTransportState(state) {
    const { controller, timer } = withTimeout(REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(TRANSPORT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(state || {}),
        signal: controller.signal,
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (_error) {
        payload = null;
      }

      if (!response.ok) {
        const apiMessage =
          payload && payload.error ? `: ${payload.error}` : "";
        const err = new Error(`Transport save failed (${response.status})${apiMessage}`);
        err.statusCode = response.status;
        throw err;
      }

      setTransportSyncStatus("Scroll sync live", "ok");
      return payload || { ok: true };
    } catch (error) {
      console.warn("Transport save failed.", error);
      if (error && error.statusCode === 409) {
        setTransportSyncStatus("Scroll sync live", "ok");
      } else {
        setTransportSyncStatus("Scroll sync lagging", "error");
      }
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  window.songStorage = {
    loadSongs,
    saveSongs,
    readLocalCache,
    writeLocalCache,
    setSyncStatus,
    loadTransportState,
    saveTransportState,
    setTransportSyncStatus,
    setMissingSongSyncStatus,
    setTransportControlStatus,
  };
})();
