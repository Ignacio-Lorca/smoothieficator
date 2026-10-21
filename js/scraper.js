// Song scraper functionality
document.addEventListener("DOMContentLoaded", async () => {
  const songContent = document.getElementById("song-content");
  const loadingIndicator = document.getElementById("loading-indicator");
  const errorLoad = document.getElementById("error-load");
  const teleprompter = document.getElementById("teleprompter");

  // In-memory songs cache; source of truth is window.songStorage when available.
  const localSongs = {};

  function getSongsSnapshot() {
    return JSON.parse(JSON.stringify(localSongs));
  }

  function generateSyncId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `sync-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function ensureSongSyncIds(songs) {
    let changed = false;
    const seen = new Set();

    Object.entries(songs || {}).forEach(([key, song]) => {
      if (!song || typeof song !== "object") return;

      if (!song.syncId || typeof song.syncId !== "string") {
        song.syncId = generateSyncId();
        changed = true;
      }

      if (seen.has(song.syncId)) {
        song.syncId = generateSyncId();
        changed = true;
      }
      seen.add(song.syncId);
      songs[key] = song;
    });

    return { songs, changed };
  }

  async function migrateSongSyncIdsIfNeeded() {
    const { changed } = ensureSongSyncIds(localSongs);
    if (changed) {
      await persistSongs();
    }
  }

  async function persistSongs() {
    if (window.songStorage && typeof window.songStorage.saveSongs === "function") {
      await window.songStorage.saveSongs(getSongsSnapshot());
    } else {
      localStorage.setItem("savedSongs", JSON.stringify(localSongs));
    }
  }

  async function refreshSongsFromStorage() {
    let songs = {};
    if (window.songStorage && typeof window.songStorage.loadSongs === "function") {
      songs = await window.songStorage.loadSongs();
    } else {
      songs = JSON.parse(localStorage.getItem("savedSongs") || "{}");
    }

    Object.keys(localSongs).forEach((key) => delete localSongs[key]);
    Object.assign(localSongs, songs || {});
    await migrateSongSyncIdsIfNeeded();
  }

  // Pass-based play count (arm on scroll start; credit at ≥30% or end)
  let playPassArmed = false;
  let playPassCredited = false;
  let activePlaySong = null;

  // Make a function to update the localSongs cache from teleprompter.js edit mode
  window.updateLocalSongsCache = function (updatedSongs) {
    // Update the in-memory cache to match localStorage
    Object.keys(localSongs).forEach((key) => delete localSongs[key]);
    Object.assign(localSongs, updatedSongs);
    console.log("Local songs cache updated after editing");
  };

  await refreshSongsFromStorage();

  function getUniqueSongsByPlayCount() {
    const unique = [];
    const seen = new Set();
    Object.entries(localSongs).forEach(([id, song]) => {
      const key = `${song.title}-${song.artist}`;
      if (seen.has(key)) return;
      seen.add(key);
      unique.push({ ...song, __songId: id, playCount: song.playCount || 0 });
    });
    return unique;
  }

  function createWelcomePlayButton(song) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "welcome-play-item";
    button.title = `${song.title} — ${song.artist}`;

    const title = document.createElement("span");
    title.className = "welcome-play-item-title";
    title.textContent = `${song.title} · ${song.artist}`;

    const meta = document.createElement("span");
    meta.className = "welcome-play-item-meta";
    const count = song.playCount || 0;
    meta.textContent = `${count}×`;

    button.appendChild(title);
    button.appendChild(meta);
    button.addEventListener("click", () => {
      displaySong({ ...song });
    });
    return button;
  }

  function fillWelcomePlayList(container, songs) {
    if (!container) return;
    container.replaceChildren();
    songs.forEach((song) => {
      container.appendChild(createWelcomePlayButton(song));
    });
  }

  function renderWelcomePlayHighlights() {
    const rows = document.getElementById("welcome-play-rows");
    if (!rows) return;

    const unique = getUniqueSongsByPlayCount();
    if (unique.length === 0) {
      rows.hidden = true;
      return;
    }

    const mostPlayed = [...unique]
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 3);
    const leastPlayed = [...unique]
      .sort((a, b) => a.playCount - b.playCount)
      .slice(0, 3);

    fillWelcomePlayList(
      rows.querySelector('[data-welcome-list="most"]'),
      mostPlayed
    );
    fillWelcomePlayList(
      rows.querySelector('[data-welcome-list="least"]'),
      leastPlayed
    );
    rows.hidden = false;
  }

  window.renderWelcomePlayHighlights = renderWelcomePlayHighlights;
  document.addEventListener("welcomeShown", renderWelcomePlayHighlights);
  renderWelcomePlayHighlights();

  // Listen for the manual extraction event
  document.addEventListener("songExtracted", (event) => {
    if (event.detail) {
      displaySong(event.detail);

      // Collapse controls to maximize teleprompter space
      const controls = document.getElementById("controls");
      if (controls && !controls.classList.contains("collapsed")) {
        document.getElementById("toggle-controls").click();
      }
    }
  });

  function showError(message) {
    errorLoad.textContent = message;
    errorLoad.classList.remove("hidden");
  }

  function findStoredSongEntry(song) {
    if (!song) return null;
    const syncId =
      song.syncId ||
      window.currentDisplayedSongId ||
      (song.__songId ? localSongs[song.__songId]?.syncId || song.__songId : null);
    if (syncId) {
      const bySync = Object.entries(localSongs).find(
        ([id, savedSong]) => savedSong.syncId === syncId || id === syncId
      );
      if (bySync) return bySync;
    }
    if (song.title && song.artist) {
      return (
        Object.entries(localSongs).find(
          ([, savedSong]) =>
            savedSong.title === song.title && savedSong.artist === song.artist
        ) || null
      );
    }
    return null;
  }

  function canCreditPlayCount() {
    if (
      !window.transportSync ||
      typeof window.transportSync.getIsConductor !== "function"
    ) {
      return true;
    }
    return !!window.transportSync.getIsConductor();
  }

  async function creditPlay() {
    if (playPassCredited || !playPassArmed) return;
    if (!canCreditPlayCount()) return;

    const song = activePlaySong || window.currentDisplayedSong;
    const match = findStoredSongEntry(song);
    if (!match) return;

    const [id, savedSong] = match;
    savedSong.playCount = (savedSong.playCount || 0) + 1;
    savedSong.lastPlayedAt = new Date().toISOString();
    localSongs[id] = savedSong;
    playPassCredited = true;

    try {
      await persistSongs();
    } catch (error) {
      console.error("Failed to persist play count:", error);
    }
  }

  function onSongDisplayedForPlayCount(song) {
    activePlaySong = song || null;
    playPassArmed = false;
    playPassCredited = false;
  }

  function armPlayPass() {
    if (playPassCredited) return;
    playPassArmed = true;
  }

  function noteTimelineProgress(ratio) {
    if (!playPassArmed || playPassCredited) return;
    if (!Number.isFinite(ratio) || ratio < 0.3) return;
    creditPlay().catch((error) => {
      console.error("Failed to credit play count:", error);
    });
  }

  function noteReachedEnd() {
    if (!playPassArmed || playPassCredited) return;
    creditPlay().catch((error) => {
      console.error("Failed to credit play count:", error);
    });
  }

  function onTimelineReset() {
    // New pass eligible after returning to top (same song can count again)
    playPassArmed = false;
    playPassCredited = false;
  }

  window.songPlayCount = {
    onSongDisplayed: onSongDisplayedForPlayCount,
    armPlayPass,
    noteTimelineProgress,
    noteReachedEnd,
    onTimelineReset,
  };

  function appendPlayMeta(songInfo, song) {
    const playCount = song.playCount || 0;
    if (playCount <= 0) return;
    const playCountDiv = document.createElement("div");
    playCountDiv.classList.add("fullscreen-songs-playcount");
    let text = `Played ${playCount} time${playCount !== 1 ? "s" : ""}`;
    if (song.lastPlayedAt) {
      const playedDate = new Date(song.lastPlayedAt);
      if (!Number.isNaN(playedDate.getTime())) {
        text += ` · Last: ${playedDate.toLocaleDateString()}`;
      }
    }
    playCountDiv.textContent = text;
    songInfo.appendChild(playCountDiv);
  }

  function displaySong(song) {
    onSongDisplayedForPlayCount(song);

    if (window.songRender && typeof window.songRender.renderSongToContainer === "function") {
      window.songRender.renderSongToContainer(song, songContent);
    } else {
      songContent.replaceChildren();
      const fallback = document.createElement("div");
      fallback.className = "song-body";
      fallback.textContent = song.content || "";
      songContent.appendChild(fallback);
    }

    // Safely scroll to the top of the content if teleprompter exists
    if (teleprompter) {
      teleprompter.scrollTop = 0;
    }

    // Load saved scroll speed if available
    if (song.scrollSpeed) {
      const scrollSpeedInput = document.getElementById("scroll-speed");
      const speedValueDisplay = document.querySelector(".speed-value");

      if (scrollSpeedInput) {
        scrollSpeedInput.value = song.scrollSpeed;
        if (speedValueDisplay) {
          speedValueDisplay.textContent = song.scrollSpeed;
        }
      }
    }

    // Check if song already exists before saving
    // Don't save if this is triggered by keyboard navigation
    const isKeyboardNavigation = window.navigationInProgress === true;

    if (!isKeyboardNavigation && !songExistsInStorage(song)) {
      console.log("Saving song to storage (not a navigation event)");
      // Save to local storage with the current timestamp as key
      const timestamp = new Date().toISOString();
      // Initialize playCount and dateAdded for new songs
      if (!song.playCount) {
        song.playCount = 0;
      }
      if (!song.dateAdded) {
        song.dateAdded = timestamp;
      }
      if (!song.syncId) {
        song.syncId = generateSyncId();
      }
      localSongs[timestamp] = song;
      persistSongs();

      // Refresh the saved songs list if it's currently open
      updateSavedSongsDropdown();
    } else if (isKeyboardNavigation) {
      console.log("Skipping save due to navigation event");
    } else if (songExistsInStorage(song)) {
      console.log("Skipping save because song already exists");

      // Update the stored song's scroll speed if it changed
      const currentScrollSpeed = document.getElementById("scroll-speed")?.value;
      if (
        currentScrollSpeed &&
        song.scrollSpeed !== parseInt(currentScrollSpeed)
      ) {
        updateSongScrollSpeed(song, parseInt(currentScrollSpeed));
      }
    }

    // Store current song reference for scroll speed updates
    window.currentDisplayedSong = song;
    if (song && song.syncId) {
      window.currentDisplayedSongId = song.syncId;
    } else if (song && song.__songId) {
      const entry = localSongs[song.__songId];
      window.currentDisplayedSongId =
        entry && entry.syncId ? entry.syncId : song.__songId;
    } else {
      const entries = Object.entries(localSongs);
      const match = entries.find(
        ([id, savedSong]) => savedSong.title === song.title && savedSong.artist === song.artist
      );
      window.currentDisplayedSongId = match ? match[1].syncId || match[0] : null;
    }

    updateCurrentSongChip(song);

    // Dispatch event that song has loaded
    window.dispatchEvent(new CustomEvent("songLoaded"));

    // Make sure mini controls are visible if they exist
    const miniControls = document.getElementById("mini-controls");
    if (miniControls) {
      miniControls.classList.add("visible");
    }
  }

  function truncateLabel(text, maxLength) {
    const value = String(text || "").trim();
    if (value.length <= maxLength) return value;
    return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  function updateCurrentSongChip(song) {
    const chip = document.getElementById("current-song-chip");
    if (!chip) return;
    const titleEl = chip.querySelector(".current-song-title");
    const artistEl = chip.querySelector(".current-song-artist");
    if (!song || !song.title) {
      chip.classList.add("hidden");
      if (titleEl) titleEl.textContent = "No song";
      if (artistEl) artistEl.textContent = "";
      chip.title = "";
      return;
    }
    const title = String(song.title || "").trim();
    const artist = String(song.artist || "").trim();
    if (titleEl) titleEl.textContent = truncateLabel(title, 28);
    if (artistEl) {
      artistEl.textContent = artist ? truncateLabel(artist, 28) : "";
    }
    chip.title = artist ? `${title} — ${artist}` : title;
    chip.classList.remove("hidden");
  }

  // Helper function to check if song already exists in storage
  function songExistsInStorage(newSong) {
    return Object.values(localSongs).some(
      (savedSong) =>
        savedSong.title === newSong.title && savedSong.artist === newSong.artist
    );
  }

  // Helper function to update a song's scroll speed in storage
  function updateSongScrollSpeed(song, newSpeed) {
    // Find the song in local storage and update its scroll speed
    const entries = Object.entries(localSongs);
    const match = entries.find(
      ([id, savedSong]) =>
        savedSong.title === song.title && savedSong.artist === song.artist
    );

    if (match) {
      const [id, savedSong] = match;
      savedSong.scrollSpeed = newSpeed;
      localSongs[id] = savedSong;
      persistSongs();

      // Update the current displayed song reference
      if (window.currentDisplayedSong) {
        window.currentDisplayedSong.scrollSpeed = newSpeed;
      }
    }
  }

  // Process song data from extraction tools
  window.processSongFromBookmarklet = function (songData) {
    if (!songData || !songData.content) {
      showError("Invalid or missing song data");
      return false;
    }

    // Display the song
    displaySong(songData);

    return true;
  };

  window.getCurrentSongTransportId = function () {
    if (window.currentDisplayedSong && window.currentDisplayedSong.syncId) {
      return window.currentDisplayedSong.syncId;
    }
    return window.currentDisplayedSongId || "";
  };

  window.openSongByTransportId = function (transportSongId) {
    if (!transportSongId) return false;

    const entries = Object.entries(localSongs);
    let match = entries.find(([, song]) => song.syncId === transportSongId);

    if (!match) {
      match = entries.find(([id]) => id === transportSongId);
    }

    if (!match && transportSongId.includes("::")) {
      const [title, artist] = transportSongId.split("::");
      match = entries.find(
        ([_, song]) => song.title === (title || "").trim() && song.artist === (artist || "").trim()
      );
      if (match) {
        console.warn(
          "Resolved song by legacy title::artist transport ID; update clients to use syncId."
        );
      }
    }

    if (!match) return false;
    const [id, song] = match;
    displaySong({ ...song, __songId: id });
    return true;
  };

  // Function to display and manage saved songs
  function showSavedSongs() {
    // Clear song content
    songContent.innerHTML = "";

    // Create saved songs UI
    const savedSongsDiv = document.createElement("div");
    savedSongsDiv.classList.add("saved-songs");

    // Check if controls are collapsed and add appropriate class
    const controls = document.getElementById("controls");
    const isControlsCollapsed =
      controls && controls.classList.contains("collapsed");
    if (isControlsCollapsed) {
      savedSongsDiv.classList.add("with-collapsed-controls");
    } else {
      savedSongsDiv.classList.add("with-expanded-controls");
    }

    // Add a back button to return to extraction UI
    const topControls = document.createElement("div");
    topControls.classList.add("saved-songs-controls");

    const backButton = document.createElement("button");
    backButton.textContent = "Back to Song Extraction";
    backButton.classList.add("compact-button");
    backButton.addEventListener("click", function () {
      // Hide the saved songs view
      songContent.innerHTML = "";
    });

    topControls.appendChild(backButton);
    savedSongsDiv.appendChild(topControls);

    const savedSongsHeader = document.createElement("h2");
    savedSongsHeader.textContent = "Your Saved Songs";
    savedSongsDiv.appendChild(savedSongsHeader);

    const songsList = document.createElement("ul");
    songsList.classList.add("songs-list");

    const savedSongsEntries = Object.entries(localSongs);

    if (savedSongsEntries.length === 0) {
      const noSongs = document.createElement("p");
      noSongs.textContent =
        "No songs saved yet. Load a song to save it automatically.";
      savedSongsDiv.appendChild(noSongs);
    } else {
      savedSongsEntries.forEach(([id, song]) => {
        const songItem = document.createElement("li");

        const songTitle = document.createElement("span");
        const limitedTitle = limitLength(song.title, 60);
        const limitedArtist = limitLength(song.artist, 60);
        songTitle.textContent = `${limitedTitle} - ${limitedArtist}`;
        songTitle.title = `${song.title} - ${song.artist}`; // Add tooltip for full names
        songItem.appendChild(songTitle);

        const loadButton = document.createElement("button");
        loadButton.textContent = "Load";
        loadButton.addEventListener("click", () => {
          displaySong(song);
        });
        songItem.appendChild(loadButton);

        // Add Rename button
        const renameButton = document.createElement("button");
        renameButton.textContent = "Rename";
        renameButton.addEventListener("click", () => {
          const newTitle = prompt("Enter new song title:", song.title);
          if (newTitle === null) return; // Cancelled
          const newArtist = prompt("Enter new artist name:", song.artist);
          if (newArtist === null) return; // Cancelled
          if (!newTitle.trim() || !newArtist.trim()) {
            alert("Title and artist cannot be empty.");
            return;
          }
          // Check for duplicate
          const duplicate = Object.values(localSongs).some(
            (s, idx) =>
              s.title === newTitle.trim() &&
              s.artist === newArtist.trim() &&
              Object.keys(localSongs)[idx] !== id
          );
          if (duplicate) {
            alert("A song with this title and artist already exists.");
            return;
          }
          song.title = newTitle.trim();
          song.artist = newArtist.trim();
          localSongs[id] = song;
          persistSongs();
          showSavedSongs();
        });
        songItem.appendChild(renameButton);

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "Delete";
        deleteButton.classList.add("delete-button");
        deleteButton.addEventListener("click", () => {
          if (confirm(`Delete "${song.title}" from saved songs?`)) {
            delete localSongs[id];
            persistSongs();
            showSavedSongs(); // Refresh the list
          }
        });
        songItem.appendChild(deleteButton);

        songsList.appendChild(songItem);
      });
      savedSongsDiv.appendChild(songsList);
    }

    songContent.appendChild(savedSongsDiv);
  }

  // Saved songs dropdown functionality
  const savedSongsBtn = document.getElementById("saved-songs-button");
  const songsDropdownContent = document.querySelector(
    "#songs-dropdown .dropdown-content"
  );
  const savedSongsContainer = document.getElementById("saved-songs-container");

  if (savedSongsBtn && songsDropdownContent) {
    savedSongsBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      // Show fullscreen view instead of dropdown
      showFullscreenSavedSongs();

      // Close tools menu if open
      if (typeof window.closeToolsMenu === "function") {
        window.closeToolsMenu();
      } else {
        const toolsMenu = document.getElementById("tools-menu-content");
        if (toolsMenu) toolsMenu.classList.add("hidden");
      }

      // Close shortcuts popup if open
      const shortcutsPopup = document.getElementById("shortcuts-popup");
      if (shortcutsPopup && !shortcutsPopup.classList.contains("hidden")) {
        shortcutsPopup.classList.add("hidden");
      }
    });
  }

  // Initialize navigation buttons
  const prevSongBtn = document.getElementById("prev-song");
  const nextSongBtn = document.getElementById("next-song");

  if (prevSongBtn) {
    prevSongBtn.addEventListener("click", () => {
      if (typeof window.goToPreviousSong === "function") {
        window.goToPreviousSong();
      }
    });
  }

  if (nextSongBtn) {
    nextSongBtn.addEventListener("click", () => {
      if (typeof window.goToNextSong === "function") {
        window.goToNextSong();
      }
    });
  }

  // Helper function to limit string length
  function limitLength(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + "...";
  }

  // Update the saved songs dropdown content
  function updateSavedSongsDropdown() {
    if (!savedSongsContainer) return;

    const savedSongsData = localSongs;
    savedSongsContainer.innerHTML = "";

    const header = document.createElement("div");
    header.classList.add("songs-header");
    header.innerHTML = `<h3>Saved Songs</h3>`;
    savedSongsContainer.appendChild(header);

    const savedSongsEntries = Object.entries(savedSongsData);

    if (savedSongsEntries.length === 0) {
      const noSongs = document.createElement("p");
      noSongs.textContent =
        "No songs saved yet. Extract a song to save it automatically.";
      noSongs.style.padding = "10px 5px";
      savedSongsContainer.appendChild(noSongs);
    } else {
      const songsList = document.createElement("ul");
      songsList.classList.add("songs-list");

      // Sort by newest first
      savedSongsEntries.sort((a, b) => b[0].localeCompare(a[0]));

      savedSongsEntries.forEach(([id, song]) => {
        const songItem = document.createElement("li");

        const songTitle = document.createElement("span");
        const limitedTitle = limitLength(song.title, 20);
        const limitedArtist = limitLength(song.artist, 20);
        songTitle.textContent = `${limitedTitle} - ${limitedArtist}`;
        songTitle.title = `${song.title} - ${song.artist}`; // Add tooltip for full names
        songItem.appendChild(songTitle);

        const loadButton = document.createElement("button");
        loadButton.textContent = "Load";
        loadButton.addEventListener("click", () => {
          displaySong(song);
          songsDropdownContent.classList.add("hidden");
        });
        songItem.appendChild(loadButton);

        // Add Rename button to dropdown
        const renameButton = document.createElement("button");
        renameButton.textContent = "Rename";
        renameButton.addEventListener("click", (e) => {
          e.stopPropagation();
          const newTitle = prompt("Enter new song title:", song.title);
          if (newTitle === null) return; // Cancelled
          const newArtist = prompt("Enter new artist name:", song.artist);
          if (newArtist === null) return; // Cancelled
          if (!newTitle.trim() || !newArtist.trim()) {
            alert("Title and artist cannot be empty.");
            return;
          }
          // Check for duplicate
          const duplicate = Object.values(localSongs).some(
            (s, idx) =>
              s.title === newTitle.trim() &&
              s.artist === newArtist.trim() &&
              Object.keys(localSongs)[idx] !== id
          );
          if (duplicate) {
            alert("A song with this title and artist already exists.");
            return;
          }
          song.title = newTitle.trim();
          song.artist = newArtist.trim();
          localSongs[id] = song;
          persistSongs();
          updateSavedSongsDropdown();
        });
        songItem.appendChild(renameButton);

        const deleteButton = document.createElement("button");
        deleteButton.textContent = "X";
        deleteButton.classList.add("delete-button");
        deleteButton.title = "Delete Song";
        deleteButton.addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`Delete "${song.title}" from saved songs?`)) {
            delete localSongs[id];
            persistSongs();
            updateSavedSongsDropdown(); // Refresh the list
          }
        });
        songItem.appendChild(deleteButton);

        songsList.appendChild(songItem);
      });

      savedSongsContainer.appendChild(songsList);
    }
  }

  // Import/Export functionality
  const exportSongsBtn = document.getElementById("export-songs-button");
  const importSongsBtn = document.getElementById("import-songs-button");
  const importFileInput = document.getElementById("import-file-input");
  const importStatus = document.getElementById("import-status");

  // Export songs functionality
  if (exportSongsBtn) {
    exportSongsBtn.addEventListener("click", () => {
      const savedSongsData = JSON.stringify(localSongs);

      if (!savedSongsData || savedSongsData === "{}") {
        alert("No songs to export. Save some songs first!");
        return;
      }

      // Create JSON file blob
      const blob = new Blob([savedSongsData], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      // Create download link
      const a = document.createElement("a");
      a.href = url;
      a.download = `smoothieficator-songs-${
        new Date().toISOString().split("T")[0]
      }.json`;
      document.body.appendChild(a);
      a.click();

      // Clean up
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);

      // Hide tools menu after export
      if (typeof window.closeToolsMenu === "function") {
        window.closeToolsMenu();
      }
    });
  }

  // Import songs functionality
  if (importSongsBtn && importFileInput) {
    importSongsBtn.addEventListener("click", () => {
      importFileInput.click();
    });

    importFileInput.addEventListener("change", (e) => {
      if (!e.target.files.length) return;

      const file = e.target.files[0];
      if (file.type !== "application/json" && !file.name.endsWith(".json")) {
        showImportStatus("Error: Please select a valid JSON file.", "error");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const importedData = JSON.parse(event.target.result);

          // Validate imported data format
          if (typeof importedData !== "object") {
            showImportStatus("Error: Invalid data format.", "error");
            return;
          }

          // Get current songs
          const currentSongs = { ...localSongs };

          // Count stats for user feedback
          let totalImported = 0;
          let newSongs = 0;
          let updatedSongs = 0;

          // Process imported songs
          Object.entries(importedData).forEach(([id, song]) => {
            // Validate song data
            if (!song.title || !song.artist || !song.content) {
              return; // Skip invalid entries
            }

            // Initialize playCount if it doesn't exist
            if (typeof song.playCount === "undefined") {
              song.playCount = 0;
            }

            // Initialize dateAdded if it doesn't exist (for old exports)
            if (!song.dateAdded) {
              song.dateAdded = id; // Use the key as fallback
            }

            totalImported++;

            // Check if song already exists
            const existingEntry = Object.entries(currentSongs).find(
              ([_, savedSong]) =>
                savedSong.title === song.title &&
                savedSong.artist === song.artist
            );

            if (existingEntry) {
              updatedSongs++;
              // Update existing song, preserving playCount if higher and dateAdded
              const [existingId, existingSong] = existingEntry;
              const existingPlayCount = existingSong.playCount || 0;
              const importedPlayCount = song.playCount || 0;
              // Keep the higher play count
              song.playCount = Math.max(existingPlayCount, importedPlayCount);
              // Keep the newer lastPlayedAt
              const existingLast = existingSong.lastPlayedAt || "";
              const importedLast = song.lastPlayedAt || "";
              const newerLast = [existingLast, importedLast]
                .filter(Boolean)
                .sort()
                .pop();
              if (newerLast) {
                song.lastPlayedAt = newerLast;
              } else {
                delete song.lastPlayedAt;
              }
              // Preserve the original dateAdded (keep the earlier one)
              if (existingSong.dateAdded) {
                song.dateAdded = existingSong.dateAdded;
              }
              if (existingSong.syncId) {
                song.syncId = existingSong.syncId;
              } else if (!song.syncId) {
                song.syncId = generateSyncId();
              }
              currentSongs[existingId] = song;
            } else {
              newSongs++;
              // Add as new song - preserve original dateAdded or use key as fallback
              if (!song.dateAdded) {
                song.dateAdded = id; // Use the timestamp key as fallback for old exports
              }
              if (!song.syncId) {
                song.syncId = generateSyncId();
              }
              currentSongs[id] = song;
            }
          });

          // Update cache and persist remotely/local fallback
          Object.keys(localSongs).forEach((key) => delete localSongs[key]);
          Object.assign(localSongs, currentSongs);
          ensureSongSyncIds(localSongs);
          persistSongs();

          // Update UI and show status message
          updateSavedSongsDropdown();
          showImportStatus(
            `Import successful: ${totalImported} songs imported (${newSongs} new, ${updatedSongs} updated).`,
            "success"
          );
        } catch (error) {
          console.error("Import error:", error);
          showImportStatus(
            "Error: Could not parse the imported file.",
            "error"
          );
        }
      };

      reader.onerror = () => {
        showImportStatus("Error: Could not read the file.", "error");
      };

      reader.readAsText(file);

      // Reset the input so the same file can be selected again
      e.target.value = "";
    });
  }

  // Helper function to show import status
  function showImportStatus(message, type) {
    if (!importStatus) return;

    importStatus.textContent = message;
    importStatus.className =
      type === "error" ? "error-status" : "success-status";
    importStatus.classList.remove("hidden");

    // Auto-hide after 5 seconds
    setTimeout(() => {
      importStatus.classList.add("hidden");
    }, 5000);
  }

  // Fullscreen saved songs functionality
  let fullscreenSongsView = null;
  let selectedSongIndex = 0;
  let fullscreenSongsList = [];
  let allSongsData = []; // Store all songs for filtering
  let searchInput = null; // Store reference to search input
  const SORT_MODE_STORAGE_KEY = "songSortMode";
  const SEARCH_FILTER_STORAGE_KEY = "songSearchFilter";
  const sortModes = [
    { id: "newest", label: "Newest First" },
    { id: "oldest", label: "Oldest First" },
    { id: "songAZ", label: "Song Name (A-Ö)" },
    { id: "songZA", label: "Song Name (Ö-A)" },
    { id: "artistAZ", label: "Artist (A-Ö)" },
    { id: "artistZA", label: "Artist (Ö-A)" },
    { id: "playCount", label: "Most Played" },
    { id: "leastPlayed", label: "Least Played" },
    { id: "recentlyPlayed", label: "Recently Played" },
  ];

  function readStoredSortMode() {
    try {
      const stored = localStorage.getItem(SORT_MODE_STORAGE_KEY);
      if (stored && sortModes.some((mode) => mode.id === stored)) {
        return stored;
      }
    } catch {
      /* ignore */
    }
    return "newest";
  }

  function persistSortMode(mode) {
    try {
      localStorage.setItem(SORT_MODE_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }

  function readStoredSearchFilter() {
    try {
      return localStorage.getItem(SEARCH_FILTER_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function persistSearchFilter(value) {
    persistedSearchFilter = String(value || "");
    try {
      localStorage.setItem(SEARCH_FILTER_STORAGE_KEY, persistedSearchFilter);
    } catch {
      /* ignore */
    }
  }

  let currentSortMode = readStoredSortMode();
  let persistedSearchFilter = readStoredSearchFilter();

  // Function to sort songs based on current sort mode
  function sortSongs(songsArray, sortMode) {
    const sorted = [...songsArray]; // Create a copy to avoid mutating original

    switch (sortMode) {
      case "songAZ":
        sorted.sort((a, b) =>
          a[1].title.localeCompare(b[1].title, "fi", { sensitivity: "base" })
        );
        break;
      case "songZA":
        sorted.sort((a, b) =>
          b[1].title.localeCompare(a[1].title, "fi", { sensitivity: "base" })
        );
        break;
      case "artistAZ":
        sorted.sort((a, b) =>
          a[1].artist.localeCompare(b[1].artist, "fi", { sensitivity: "base" })
        );
        break;
      case "artistZA":
        sorted.sort((a, b) =>
          b[1].artist.localeCompare(a[1].artist, "fi", { sensitivity: "base" })
        );
        break;
      case "playCount":
        sorted.sort((a, b) => {
          const countA = a[1].playCount || 0;
          const countB = b[1].playCount || 0;
          return countB - countA; // Most played first
        });
        break;
      case "leastPlayed":
        sorted.sort((a, b) => {
          const countA = a[1].playCount || 0;
          const countB = b[1].playCount || 0;
          return countA - countB; // Least played first
        });
        break;
      case "recentlyPlayed":
        sorted.sort((a, b) => {
          const dateA = a[1].lastPlayedAt || "";
          const dateB = b[1].lastPlayedAt || "";
          if (!dateA && !dateB) return 0;
          if (!dateA) return 1; // missing dates last
          if (!dateB) return -1;
          return dateB.localeCompare(dateA);
        });
        break;
      case "oldest":
        sorted.sort((a, b) => {
          const dateA = a[1].dateAdded || a[0];
          const dateB = b[1].dateAdded || b[0];
          return dateA.localeCompare(dateB);
        });
        break;
      case "newest":
      default:
        sorted.sort((a, b) => {
          const dateA = a[1].dateAdded || a[0];
          const dateB = b[1].dateAdded || b[0];
          return dateB.localeCompare(dateA);
        });
        break;
    }

    return sorted;
  }

  // Apply current sort and re-render the list
  function applySortAndRender() {
    // Get current search term
    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : "";
    
    // Start with all songs
    let songsToSort = allSongsData;
    
    // Apply search filter if needed
    if (searchTerm) {
      songsToSort = allSongsData.filter(([id, song]) => {
        const titleMatch = song.title.toLowerCase().includes(searchTerm);
        const artistMatch = song.artist.toLowerCase().includes(searchTerm);
        return titleMatch || artistMatch;
      });
    }
    
    // Apply sorting
    fullscreenSongsList = sortSongs(songsToSort, currentSortMode);
    selectedSongIndex = 0;
    
    // Re-render
    renderFilteredSongs();
  }

  // Cycle to next sort mode (for keyboard shortcut)
  function cycleNextSortMode() {
    const currentIndex = sortModes.findIndex(mode => mode.id === currentSortMode);
    const nextIndex = (currentIndex + 1) % sortModes.length;
    currentSortMode = sortModes[nextIndex].id;
    persistSortMode(currentSortMode);
    
    // Update the select element if it exists
    const sortSelect = document.getElementById("sort-mode-select");
    if (sortSelect) {
      sortSelect.value = currentSortMode;
    }
    
    applySortAndRender();
  }

  // Cycle to previous sort mode (for keyboard shortcut)
  function cyclePrevSortMode() {
    const currentIndex = sortModes.findIndex(mode => mode.id === currentSortMode);
    const prevIndex = (currentIndex - 1 + sortModes.length) % sortModes.length;
    currentSortMode = sortModes[prevIndex].id;
    persistSortMode(currentSortMode);
    
    // Update the select element if it exists
    const sortSelect = document.getElementById("sort-mode-select");
    if (sortSelect) {
      sortSelect.value = currentSortMode;
    }
    
    applySortAndRender();
  }

  // Current song list for prev/next: sticky search filter + sticky sort
  function getSongsInSortOrder() {
    let entries = Object.entries(localSongs);
    const searchTerm = persistedSearchFilter.toLowerCase().trim();
    if (searchTerm) {
      entries = entries.filter(([, song]) => {
        const titleMatch = String(song.title || "")
          .toLowerCase()
          .includes(searchTerm);
        const artistMatch = String(song.artist || "")
          .toLowerCase()
          .includes(searchTerm);
        return titleMatch || artistMatch;
      });
    }
    const sorted = sortSongs(entries, currentSortMode);
    const uniqueSongs = [];
    const seen = new Set();
    for (const [id, song] of sorted) {
      const key = `${song.title}-${song.artist}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueSongs.push({ ...song, __songId: id });
    }
    return uniqueSongs;
  }

  // Show fullscreen saved songs view
  function showFullscreenSavedSongs() {
    const savedSongsData = localSongs;

    // Create fullscreen overlay
    fullscreenSongsView = document.createElement("div");
    fullscreenSongsView.classList.add("fullscreen-songs-view");

    // Header
    const header = document.createElement("div");
    header.classList.add("fullscreen-songs-header");

    const headerTop = document.createElement("div");
    headerTop.classList.add("fullscreen-songs-header-top");

    const title = document.createElement("h2");
    title.textContent = "Saved Songs";

    // Add search input
    const searchContainer = document.createElement("div");
    searchContainer.classList.add("fullscreen-songs-search");
    
    searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search...";
    searchInput.classList.add("fullscreen-songs-search-input");
    searchInput.value = persistedSearchFilter;
    searchInput.addEventListener("input", handleSearchInput);
    searchInput.addEventListener("keydown", handleSearchKeydown);

    const clearSearchButton = document.createElement("button");
    clearSearchButton.type = "button";
    clearSearchButton.classList.add("fullscreen-songs-clear-search");
    clearSearchButton.textContent = "clear";
    clearSearchButton.title = "Clear search";
    clearSearchButton.addEventListener("click", () => {
      if (!searchInput) return;
      searchInput.value = "";
      persistSearchFilter("");
      handleSearchInput();
      searchInput.focus();
    });

    searchContainer.appendChild(searchInput);
    searchContainer.appendChild(clearSearchButton);

    // Add sort selector
    const sortContainer = document.createElement("div");
    sortContainer.classList.add("fullscreen-songs-sort");

    const sortLabel = document.createElement("span");
    sortLabel.classList.add("sort-label");
    sortLabel.textContent = "Sort:";

    const sortSelect = document.createElement("select");
    sortSelect.id = "sort-mode-select";
    sortSelect.classList.add("sort-select");

    sortModes.forEach((mode) => {
      const option = document.createElement("option");
      option.value = mode.id;
      option.textContent = mode.label;
      if (mode.id === currentSortMode) {
        option.selected = true;
      }
      sortSelect.appendChild(option);
    });

    sortSelect.addEventListener("change", (e) => {
      currentSortMode = e.target.value;
      persistSortMode(currentSortMode);
      applySortAndRender();
    });

    sortContainer.appendChild(sortLabel);
    sortContainer.appendChild(sortSelect);

    const closeButton = document.createElement("button");
    closeButton.classList.add("fullscreen-songs-close");
    closeButton.textContent = "Close";
    closeButton.addEventListener("click", closeFullscreenSavedSongs);

    headerTop.appendChild(title);
    headerTop.appendChild(searchContainer);
    headerTop.appendChild(sortContainer);
    headerTop.appendChild(closeButton);
    header.appendChild(headerTop);
    
    fullscreenSongsView.appendChild(header);

    // Content area
    const content = document.createElement("div");
    content.classList.add("fullscreen-songs-content");

    const savedSongsEntries = Object.entries(savedSongsData);

    if (savedSongsEntries.length === 0) {
      const emptyMessage = document.createElement("div");
      emptyMessage.classList.add("fullscreen-songs-empty");
      emptyMessage.textContent =
        "No songs saved yet. Add a song to get started!";
      content.appendChild(emptyMessage);
    } else {
      // Store all songs data; apply sticky search + sort
      allSongsData = savedSongsEntries;
      let songsToSort = allSongsData;
      const searchTerm = persistedSearchFilter.toLowerCase().trim();
      if (searchTerm) {
        songsToSort = allSongsData.filter(([, song]) => {
          const titleMatch = song.title.toLowerCase().includes(searchTerm);
          const artistMatch = song.artist.toLowerCase().includes(searchTerm);
          return titleMatch || artistMatch;
        });
      }
      fullscreenSongsList = sortSongs(songsToSort, currentSortMode);
      selectedSongIndex = 0;

      const songsList = document.createElement("ul");
      songsList.classList.add("fullscreen-songs-list");
      songsList.id = "fullscreen-songs-list";

      fullscreenSongsList.forEach(([id, song], index) => {
        const songItem = document.createElement("li");
        songItem.dataset.songId = id;
        songItem.dataset.index = index;

        if (index === selectedSongIndex) {
          songItem.classList.add("selected");
        }

        // Song info
        const songInfo = document.createElement("div");
        songInfo.classList.add("fullscreen-songs-info");

        const songTitle = document.createElement("div");
        songTitle.classList.add("fullscreen-songs-title");
        songTitle.textContent = song.title;

        const songArtist = document.createElement("div");
        songArtist.classList.add("fullscreen-songs-artist");
        songArtist.textContent = `by ${song.artist}`;

        songInfo.appendChild(songTitle);
        songInfo.appendChild(songArtist);
        appendPlayMeta(songInfo, song);

        // Actions
        const actions = document.createElement("div");
        actions.classList.add("fullscreen-songs-actions");

        const loadButton = document.createElement("button");
        loadButton.classList.add("fullscreen-songs-load");
        loadButton.textContent = "Load";
        loadButton.addEventListener("click", () => {
          displaySong(song);
          closeFullscreenSavedSongs();
        });

        const renameButton = document.createElement("button");
        renameButton.classList.add("fullscreen-songs-rename");
        renameButton.textContent = "Rename";
        renameButton.addEventListener("click", (e) => {
          e.stopPropagation();
          renameSongInFullscreen(id, song, songItem);
        });

        const deleteButton = document.createElement("button");
        deleteButton.classList.add("fullscreen-songs-delete");
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteSongInFullscreen(id, song);
        });

        actions.appendChild(loadButton);
        actions.appendChild(renameButton);
        actions.appendChild(deleteButton);

        songItem.appendChild(songInfo);
        songItem.appendChild(actions);

        // Add click handler for song selection
        songItem.addEventListener("click", () => {
          selectSongInFullscreen(index);
        });

        songsList.appendChild(songItem);
      });

      content.appendChild(songsList);

      // Ensure first song is selected and visible
      setTimeout(() => {
        selectSongInFullscreen(0);
      }, 100);
    }

    fullscreenSongsView.appendChild(content);

    // Instructions footer
    const instructions = document.createElement("div");
    instructions.classList.add("fullscreen-songs-instructions");
    instructions.innerHTML = `
      <strong>Search:</strong> Type to filter • 
      <kbd>↑</kbd><kbd>↓</kbd> Navigate • <kbd>Enter</kbd> Load Song • 
      <kbd>←</kbd><kbd>→</kbd> Change Sort • <kbd>R</kbd> Rename • <kbd>Delete</kbd> Remove • <kbd>Esc</kbd> Clear/Close
    `;
    fullscreenSongsView.appendChild(instructions);

    // Add to DOM
    document.body.appendChild(fullscreenSongsView);

    // Add event listeners for keyboard navigation
    document.addEventListener("keydown", handleFullscreenSongsKeydown);

    // Focus the search input
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }
  }

  // Close fullscreen saved songs view
  function closeFullscreenSavedSongs() {
    if (fullscreenSongsView) {
      document.removeEventListener("keydown", handleFullscreenSongsKeydown);
      document.body.removeChild(fullscreenSongsView);
      fullscreenSongsView = null;
      fullscreenSongsList = [];
      allSongsData = [];
      searchInput = null;
      selectedSongIndex = 0;
    }
  }

  // Handle keyboard navigation in fullscreen view
  function handleFullscreenSongsKeydown(e) {
    if (!fullscreenSongsView) return;

    // Don't handle keys if there are no songs
    if (fullscreenSongsList.length === 0) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeFullscreenSavedSongs();
      }
      return;
    }

    // Don't intercept typing in search input, except for specific navigation keys
    const isSearchFocused = document.activeElement === searchInput;
    
    switch (e.key) {
      case "ArrowUp":
        e.preventDefault();
        navigateFullscreenSongs(-1);
        break;

      case "ArrowDown":
        e.preventDefault();
        navigateFullscreenSongs(1);
        break;

      case "Enter":
        e.preventDefault();
        loadSelectedSong();
        break;

      case "Delete":
        // Only delete song if not focused on search input
        if (!isSearchFocused) {
          e.preventDefault();
          deleteSelectedSong();
        }
        break;

      case "Backspace":
        // Only delete song if not focused on search input
        if (!isSearchFocused) {
          e.preventDefault();
          deleteSelectedSong();
        }
        break;

      case "r":
      case "R":
        // Only rename if not focused on search input
        if (!isSearchFocused) {
          e.preventDefault();
          renameSelectedSong();
        }
        break;

      case "ArrowLeft":
        e.preventDefault();
        cyclePrevSortMode();
        break;

      case "ArrowRight":
        e.preventDefault();
        cycleNextSortMode();
        break;

      case "Escape":
        e.preventDefault();
        // If search has text, clear it; otherwise close the view
        if (isSearchFocused && searchInput.value) {
          searchInput.value = "";
          persistSearchFilter("");
          handleSearchInput();
        } else {
          closeFullscreenSavedSongs();
        }
        break;
    }
  }

  // Handle search input keydown for special keys
  function handleSearchKeydown(e) {
    // These keys are handled by handleFullscreenSongsKeydown
    // No need to do anything special here
  }

  // Handle search input changes
  function handleSearchInput() {
    if (!searchInput) return;
    persistSearchFilter(searchInput.value);
    // Use the new unified sort and render function
    applySortAndRender();
  }

  // Render the filtered songs list
  function renderFilteredSongs() {
    const content = document.querySelector(".fullscreen-songs-content");
    if (!content) return;
    
    // Get or create the songs list element
    let songsList = document.getElementById("fullscreen-songs-list");
    
    if (fullscreenSongsList.length === 0) {
      // Remove the list if it exists
      if (songsList) {
        songsList.remove();
      }
      
      // Remove any existing empty message
      const existingEmpty = content.querySelector(".fullscreen-songs-empty");
      if (existingEmpty) {
        existingEmpty.remove();
      }
      
      // Add empty message
      const emptyMessage = document.createElement("div");
      emptyMessage.classList.add("fullscreen-songs-empty");
      emptyMessage.textContent = "No songs match your search.";
      content.appendChild(emptyMessage);
      return;
    }
    
    // Remove any empty message
    const existingEmpty = content.querySelector(".fullscreen-songs-empty");
    if (existingEmpty) {
      existingEmpty.remove();
    }
    
    // Create the list if it doesn't exist
    if (!songsList) {
      songsList = document.createElement("ul");
      songsList.classList.add("fullscreen-songs-list");
      songsList.id = "fullscreen-songs-list";
      content.appendChild(songsList);
    }
    
    // Clear current list content
    songsList.innerHTML = "";
    
    // Render filtered songs
    fullscreenSongsList.forEach(([id, song], index) => {
      const songItem = document.createElement("li");
      songItem.dataset.songId = id;
      songItem.dataset.index = index;

      if (index === selectedSongIndex) {
        songItem.classList.add("selected");
      }

      // Song info
      const songInfo = document.createElement("div");
      songInfo.classList.add("fullscreen-songs-info");

      const songTitle = document.createElement("div");
      songTitle.classList.add("fullscreen-songs-title");
      songTitle.textContent = song.title;

      const songArtist = document.createElement("div");
      songArtist.classList.add("fullscreen-songs-artist");
      songArtist.textContent = `by ${song.artist}`;

      songInfo.appendChild(songTitle);
      songInfo.appendChild(songArtist);
      appendPlayMeta(songInfo, song);

      // Actions
      const actions = document.createElement("div");
      actions.classList.add("fullscreen-songs-actions");

      const loadButton = document.createElement("button");
      loadButton.classList.add("fullscreen-songs-load");
      loadButton.textContent = "Load";
      loadButton.addEventListener("click", () => {
        displaySong(song);
        closeFullscreenSavedSongs();
      });

      const renameButton = document.createElement("button");
      renameButton.classList.add("fullscreen-songs-rename");
      renameButton.textContent = "Rename";
      renameButton.addEventListener("click", (e) => {
        e.stopPropagation();
        renameSongInFullscreen(id, song, songItem);
      });

      const deleteButton = document.createElement("button");
      deleteButton.classList.add("fullscreen-songs-delete");
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSongInFullscreen(id, song);
      });

      actions.appendChild(loadButton);
      actions.appendChild(renameButton);
      actions.appendChild(deleteButton);

      songItem.appendChild(songInfo);
      songItem.appendChild(actions);

      // Add click handler for song selection
      songItem.addEventListener("click", () => {
        selectSongInFullscreen(index);
      });

      songsList.appendChild(songItem);
    });
    
    // Select first song if available
    if (fullscreenSongsList.length > 0) {
      setTimeout(() => {
        selectSongInFullscreen(0);
      }, 10);
    }
  }

  // Navigate songs in fullscreen view
  function navigateFullscreenSongs(direction) {
    const newIndex = selectedSongIndex + direction;

    if (newIndex >= 0 && newIndex < fullscreenSongsList.length) {
      selectSongInFullscreen(newIndex);
    }
  }

  // Select a song in fullscreen view
  function selectSongInFullscreen(index) {
    const songsList = document.getElementById("fullscreen-songs-list");
    if (!songsList) return;

    // Remove previous selection
    const previousSelected = songsList.querySelector(".selected");
    if (previousSelected) {
      previousSelected.classList.remove("selected");
    }

    // Add new selection
    selectedSongIndex = index;
    const newSelected = songsList.children[index];
    if (newSelected) {
      newSelected.classList.add("selected");
      // Scroll into view
      newSelected.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // Load the currently selected song
  function loadSelectedSong() {
    if (
      selectedSongIndex >= 0 &&
      selectedSongIndex < fullscreenSongsList.length
    ) {
      const [id, song] = fullscreenSongsList[selectedSongIndex];
      displaySong(song);
      closeFullscreenSavedSongs();
    }
  }

  // Delete the currently selected song
  function deleteSelectedSong() {
    if (
      selectedSongIndex >= 0 &&
      selectedSongIndex < fullscreenSongsList.length
    ) {
      const [id, song] = fullscreenSongsList[selectedSongIndex];
      deleteSongInFullscreen(id, song);
    }
  }

  // Rename the currently selected song
  function renameSelectedSong() {
    if (
      selectedSongIndex >= 0 &&
      selectedSongIndex < fullscreenSongsList.length
    ) {
      const [id, song] = fullscreenSongsList[selectedSongIndex];
      const songItem = document.querySelector(`[data-song-id="${id}"]`);
      renameSongInFullscreen(id, song, songItem);
    }
  }

  // Rename song in fullscreen view
  function renameSongInFullscreen(id, song, songItem) {
    const newTitle = prompt("Enter new song title:", song.title);
    if (newTitle === null) return;
    const newArtist = prompt("Enter new artist name:", song.artist);
    if (newArtist === null) return;

    if (!newTitle.trim() || !newArtist.trim()) {
      alert("Title and artist cannot be empty.");
      return;
    }

    // Check for duplicate
    const duplicate = Object.values(localSongs).some(
      (s, idx) =>
        s.title === newTitle.trim() &&
        s.artist === newArtist.trim() &&
        Object.keys(localSongs)[idx] !== id
    );

    if (duplicate) {
      alert("A song with this title and artist already exists.");
      return;
    }

    // Update song data in localStorage
    const updatedSong = { ...song };
    updatedSong.title = newTitle.trim();
    updatedSong.artist = newArtist.trim();
    localSongs[id] = updatedSong;
    persistSongs();
    const savedSongsData = localSongs;
    const savedSongsEntries = Object.entries(savedSongsData);
    
    // Update allSongsData with fresh references
    allSongsData = savedSongsEntries;
    
    // Re-apply current sort and search to refresh the view
    applySortAndRender();
  }

  // Delete song in fullscreen view
  function deleteSongInFullscreen(id, song) {
    if (confirm(`Delete "${song.title}" from saved songs?`)) {
      delete localSongs[id];
      persistSongs();

      // Remove from UI and update arrays
      const songItem = document.querySelector(`[data-song-id="${id}"]`);
      if (songItem) {
        songItem.remove();
      }

      // Update both filtered and all songs lists
      fullscreenSongsList = fullscreenSongsList.filter(
        ([songId]) => songId !== id
      );
      allSongsData = allSongsData.filter(
        ([songId]) => songId !== id
      );

      // Adjust selected index if necessary
      if (selectedSongIndex >= fullscreenSongsList.length) {
        selectedSongIndex = Math.max(0, fullscreenSongsList.length - 1);
      }

      // If no songs left in filtered list
      if (fullscreenSongsList.length === 0) {
        // Check if there are songs in allSongsData (i.e., search is active)
        if (allSongsData.length === 0) {
          // No songs at all, close and reopen to show empty state
          closeFullscreenSavedSongs();
          showFullscreenSavedSongs();
        } else {
          // Songs exist but not in current search, show no matches message
          renderFilteredSongs();
        }
      } else {
        // Re-select current song
        selectSongInFullscreen(selectedSongIndex);
      }

      // Update the dropdown if it's open
      updateSavedSongsDropdown();
    }
  }

  // Make fullscreen function globally available
  window.showFullscreenSavedSongs = showFullscreenSavedSongs;
  window.closeFullscreenSavedSongs = closeFullscreenSavedSongs;
  window.getSongsInSortOrder = getSongsInSortOrder;

  // Initialize saved songs UI from remote/local storage.
  updateSavedSongsDropdown();
  renderWelcomePlayHighlights();
});
