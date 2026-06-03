// Multi-device transport sync (polling + conductor lease)
(function () {
  const TRANSPORT_POLL_MS = 380;
  const HEARTBEAT_MS = 200;
  const LEASE_MS = 1500;
  const HARD_SNAP_THRESHOLD_PX = 80;
  const SOFT_CORRECTION_WINDOW_PX = 14;
  const FOLLOWER_CORRECTION_GAIN = 0.06;
  const FOLLOWER_MAX_DELTA_PER_FRAME = 1.5;
  const FOLLOWER_INTERPOLATION_BUFFER_MS = 140;
  const GESTURE_PUBLISH_THROTTLE_MS = 100;
  const WHEEL_DELTA_GAIN = 1;
  const TOUCH_DELTA_GAIN = 1.1;

  let ctx = null;
  const clientSourceId = `client-${Math.random().toString(36).slice(2, 10)}`;
  let transportState = {
    songId: "",
    isPlaying: false,
    speed: 8,
    positionPx: 0,
    updatedAt: new Date(0).toISOString(),
    sourceId: "",
    version: 0,
    conductorId: "",
    conductorUntil: "",
    lastHeartbeatAt: "",
    serverNow: "",
  };
  let isConductor = false;
  let suppressTransportPublish = false;
  let isApplyingRemoteSongSwitch = false;
  let missingRemoteSongId = "";
  let lastTakeoverAttemptMs = 0;
  let lastGesturePublishMs = 0;
  let lastTouchY = null;
  let touchGestureActive = false;
  let transportPollTimer = null;
  let transportHeartbeatTimer = null;

  function speedPxPerMs(speedValue) {
    return (0.2 + (speedValue - 1) * 0.2) / 50;
  }

  function computeRemoteNowPosition(state, nowMs) {
    if (!state) return ctx.getTimelinePosition();
    const updatedAtMs = Date.parse(state.updatedAt || "");
    const safeUpdatedAt = Number.isFinite(updatedAtMs) ? updatedAtMs : nowMs;
    if (!state.isPlaying) return state.positionPx || 0;
    const elapsed = Math.max(0, nowMs - safeUpdatedAt);
    return (state.positionPx || 0) + elapsed * speedPxPerMs(state.speed || 8);
  }

  function updateTransportRoleStatus() {
    const statusElement = document.getElementById("transport-role-status");
    if (!statusElement) return;
    statusElement.classList.remove("hidden");
    statusElement.textContent = isConductor ? "Role: Conductor" : "Role: Follower";
    statusElement.dataset.state = isConductor ? "ok" : "warning";
  }

  function updateTransportHealthStatus(remote) {
    if (
      !window.songStorage ||
      typeof window.songStorage.setTransportSyncStatus !== "function" ||
      !remote
    ) {
      return;
    }
    const serverNowMs = Date.parse(remote.serverNow || "");
    const updatedAtMs = Date.parse(remote.updatedAt || "");
    if (!Number.isFinite(serverNowMs) || !Number.isFinite(updatedAtMs)) return;
    const stalenessMs = Math.max(0, serverNowMs - updatedAtMs);
    if (stalenessMs > 2000) {
      window.songStorage.setTransportSyncStatus("Sync: Degraded", "degraded");
    }
  }

  function setMissingRemoteSongStatus(songId) {
    if (!songId || songId === missingRemoteSongId) return;
    missingRemoteSongId = songId;
    if (
      window.songStorage &&
      typeof window.songStorage.setMissingSongSyncStatus === "function"
    ) {
      window.songStorage.setMissingSongSyncStatus(songId);
    }
  }

  async function ensureRemoteSongLoaded(remoteSongId) {
    if (!remoteSongId || isConductor) return true;
    const currentSongId = ctx.getSongTransportId();
    if (currentSongId === remoteSongId) return true;
    if (isApplyingRemoteSongSwitch) return false;
    if (typeof window.openSongByTransportId !== "function") return false;

    isApplyingRemoteSongSwitch = true;
    suppressTransportPublish = true;
    try {
      const opened = window.openSongByTransportId(remoteSongId);
      if (!opened) {
        setMissingRemoteSongStatus(remoteSongId);
        return false;
      }
      missingRemoteSongId = "";
      await new Promise((resolve) => setTimeout(resolve, 40));
      return ctx.getSongTransportId() === remoteSongId;
    } finally {
      suppressTransportPublish = false;
      isApplyingRemoteSongSwitch = false;
    }
  }

  async function publishTransportState(overrides = {}) {
    if (
      suppressTransportPublish ||
      !window.songStorage ||
      typeof window.songStorage.saveTransportState !== "function"
    ) {
      return false;
    }

    const nowIso = new Date().toISOString();
    const isPlaying = ctx.getIsScrolling();
    transportState = {
      ...transportState,
      songId: ctx.getSongTransportId(),
      isPlaying,
      speed: parseInt(ctx.scrollSpeedInput.value, 10),
      positionPx: ctx.getTimelinePosition(),
      updatedAt: nowIso,
      sourceId: clientSourceId,
      conductorId: clientSourceId,
      leaseMs: LEASE_MS,
      ...overrides,
      updatedAt: nowIso,
      sourceId: clientSourceId,
      conductorId: clientSourceId,
    };

    const response = await window.songStorage.saveTransportState(transportState);
    if (response && response.ok) {
      isConductor = true;
      updateTransportRoleStatus();
      transportState = {
        ...transportState,
        conductorId: response.conductorId || clientSourceId,
        conductorUntil: response.conductorUntil || transportState.conductorUntil,
        serverNow: response.serverNow || transportState.serverNow,
        version: response.version || transportState.version,
      };
      return true;
    }
    isConductor = false;
    updateTransportRoleStatus();
    return false;
  }

  async function attemptTakeoverAndPublish(actionType, overrides = {}) {
    if (suppressTransportPublish) return false;
    const nowMs = Date.now();
    if (nowMs - lastTakeoverAttemptMs < 150) return false;
    lastTakeoverAttemptMs = nowMs;

    if (
      window.songStorage &&
      typeof window.songStorage.setTransportControlStatus === "function"
    ) {
      window.songStorage.setTransportControlStatus("taking");
    }

    const ok = await publishTransportState({
      requestTakeover: true,
      actionType,
      ...overrides,
    });

    if (
      window.songStorage &&
      typeof window.songStorage.setTransportControlStatus === "function"
    ) {
      window.songStorage.setTransportControlStatus(ok ? "acquired" : "following");
    }
    return ok;
  }

  async function applyRemoteTransport(remote) {
    if (!remote || !remote.updatedAt) return;
    if (remote.songId) {
      const loaded = await ensureRemoteSongLoaded(remote.songId);
      if (!loaded) return;
    }

    const localVersion = Number(transportState.version || 0);
    const remoteVersion = Number(remote.version || 0);
    if (localVersion > 0 && remoteVersion > 0) {
      if (remoteVersion <= localVersion) return;
    } else {
      const currentTs = Date.parse(transportState.updatedAt || "");
      const remoteTs = Date.parse(remote.updatedAt || "");
      if (Number.isFinite(currentTs) && Number.isFinite(remoteTs) && remoteTs < currentTs) {
        return;
      }
    }

    transportState = { ...transportState, ...remote };
    updateTransportHealthStatus(remote);
    const remoteConductorId = remote.conductorId || "";
    isConductor = remoteConductorId !== "" && remoteConductorId === clientSourceId;
    updateTransportRoleStatus();

    const remoteSpeed = parseInt(remote.speed || ctx.scrollSpeedInput.value, 10);
    if (parseInt(ctx.scrollSpeedInput.value, 10) !== remoteSpeed) {
      suppressTransportPublish = true;
      ctx.scrollSpeedInput.value = remoteSpeed;
      ctx.scrollSpeedInput.dispatchEvent(new Event("input"));
      suppressTransportPublish = false;
    }

    const remotePos = computeRemoteNowPosition(remote, Date.now());
    const drift = remotePos - ctx.getTimelinePosition();
    if (Math.abs(drift) > HARD_SNAP_THRESHOLD_PX) {
      ctx.setTimelinePosition(remotePos);
    }

    const isPlaying = !!remote.isPlaying;
    ctx.setIsScrolling(isPlaying);
    ctx.startScrollBtn.classList.toggle("hidden", isPlaying);
    ctx.stopScrollBtn.classList.toggle("hidden", !isPlaying);
  }

  async function pollTransportState() {
    if (
      !window.songStorage ||
      typeof window.songStorage.loadTransportState !== "function"
    ) {
      return;
    }
    const remote = await window.songStorage.loadTransportState();
    if (remote) await applyRemoteTransport(remote);
  }

  function startTransportPolling() {
    if (transportPollTimer) clearInterval(transportPollTimer);
    transportPollTimer = setInterval(() => {
      pollTransportState().catch((error) => {
        console.warn("Transport poll failed", error);
      });
    }, TRANSPORT_POLL_MS);
  }

  function startTransportHeartbeat() {
    if (transportHeartbeatTimer) clearInterval(transportHeartbeatTimer);
    transportHeartbeatTimer = setInterval(() => {
      if (!isConductor || !ctx.getIsScrolling()) return;
      publishTransportState({ isPlaying: true, actionType: "heartbeat" }).catch((error) => {
        console.warn("Transport heartbeat failed", error);
      });
    }, HEARTBEAT_MS);
  }

  function shouldHandleManualSeekInput() {
    if (ctx.isEditMode()) return false;
    if (document.querySelector(".fullscreen-songs-view")) return false;
    if (isApplyingRemoteSongSwitch) return false;
    return true;
  }

  function maybePublishGestureSeek(force = false) {
    const now = Date.now();
    if (!force && now - lastGesturePublishMs < GESTURE_PUBLISH_THROTTLE_MS) return;
    lastGesturePublishMs = now;
    attemptTakeoverAndPublish("seek", {
      isPlaying: false,
      positionPx: ctx.getTimelinePosition(),
    }).catch(() => {});
  }

  function tick() {
    if (ctx.getIsScrolling() && isConductor) {
      transportState.speed = parseInt(ctx.scrollSpeedInput.value, 10);
      const nowPosition = computeRemoteNowPosition(transportState, Date.now());
      ctx.setTimelinePosition(nowPosition);
    } else if (
      !isConductor &&
      transportState.conductorId &&
      transportState.conductorId !== clientSourceId
    ) {
      const renderNowMs = Date.now() - FOLLOWER_INTERPOLATION_BUFFER_MS;
      const predictedRemotePosition = computeRemoteNowPosition(transportState, renderNowMs);
      const drift = predictedRemotePosition - ctx.getTimelinePosition();
      if (Math.abs(drift) > HARD_SNAP_THRESHOLD_PX) {
        ctx.setTimelinePosition(predictedRemotePosition);
      } else if (Math.abs(drift) > SOFT_CORRECTION_WINDOW_PX) {
        const easedDelta = drift * FOLLOWER_CORRECTION_GAIN;
        const clampedDelta = Math.max(
          -FOLLOWER_MAX_DELTA_PER_FRAME,
          Math.min(FOLLOWER_MAX_DELTA_PER_FRAME, easedDelta)
        );
        ctx.setTimelinePosition(ctx.getTimelinePosition() + clampedDelta);
      } else if (transportState.isPlaying) {
        const nextPosition =
          ctx.getTimelinePosition() + speedPxPerMs(transportState.speed || 8) * 16;
        ctx.setTimelinePosition(nextPosition);
      }
    }

    const reachedEnd = ctx.getTimelinePosition() >= ctx.maxTimelinePosition() - 10;
    if (reachedEnd && ctx.getIsScrolling()) {
      ctx.onReachedEnd();
    }
  }

  function attachGestureListeners(teleprompterEl) {
    teleprompterEl.addEventListener(
      "wheel",
      (event) => {
        if (!shouldHandleManualSeekInput()) return;
        event.preventDefault();
        const delta = event.deltaY * WHEEL_DELTA_GAIN;
        if (!Number.isFinite(delta) || delta === 0) return;
        ctx.setTimelinePosition(ctx.getTimelinePosition() + delta);
        maybePublishGestureSeek(false);
      },
      { passive: false }
    );
    teleprompterEl.addEventListener(
      "touchstart",
      (event) => {
        if (!shouldHandleManualSeekInput()) return;
        if (!event.touches || event.touches.length === 0) return;
        touchGestureActive = true;
        lastTouchY = event.touches[0].clientY;
      },
      { passive: true }
    );
    teleprompterEl.addEventListener(
      "touchmove",
      (event) => {
        if (!touchGestureActive || !shouldHandleManualSeekInput()) return;
        if (!event.touches || event.touches.length === 0) return;
        const touchY = event.touches[0].clientY;
        if (!Number.isFinite(lastTouchY)) {
          lastTouchY = touchY;
          return;
        }
        const delta = (lastTouchY - touchY) * TOUCH_DELTA_GAIN;
        lastTouchY = touchY;
        if (!Number.isFinite(delta) || delta === 0) return;
        event.preventDefault();
        ctx.setTimelinePosition(ctx.getTimelinePosition() + delta);
        maybePublishGestureSeek(false);
      },
      { passive: false }
    );
    const endTouch = () => {
      if (!touchGestureActive) return;
      touchGestureActive = false;
      lastTouchY = null;
      if (!shouldHandleManualSeekInput()) return;
      maybePublishGestureSeek(true);
    };
    teleprompterEl.addEventListener("touchend", endTouch, { passive: true });
    teleprompterEl.addEventListener("touchcancel", endTouch, { passive: true });
  }

  function init(options) {
    ctx = options;
    transportState.speed = parseInt(options.scrollSpeedInput?.value || "8", 10);
    startTransportPolling();
    startTransportHeartbeat();
    updateTransportRoleStatus();
    pollTransportState().catch((error) => {
      console.warn("Initial transport fetch failed", error);
    });
    window.addEventListener("beforeunload", () => {
      if (!isConductor || !window.songStorage) return;
      window.songStorage.saveTransportState({
        ...transportState,
        sourceId: clientSourceId,
        releaseLease: true,
        leaseMs: LEASE_MS,
      });
    });
  }

  window.transportSync = {
    init,
    tick,
    attemptTakeover: attemptTakeoverAndPublish,
    publish: publishTransportState,
    attachGestureListeners,
    getIsConductor: () => isConductor,
    setSuppressPublish: (value) => {
      suppressTransportPublish = !!value;
    },
    onSongLoaded: () =>
      attemptTakeoverAndPublish("songSelect", {
        songId: ctx.getSongTransportId(),
        isPlaying: false,
        positionPx: 0,
      }),
  };
})();
