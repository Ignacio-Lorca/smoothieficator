// Guitar chord mini-diagrams (inline SVG, render-time only)
(function () {
  const STORAGE_KEY = "smoothieficator.showChordDiagrams";
  let enabled = true;

  // frets: low E (6th) → high E (1st); x = mute, 0 = open
  const CHORD_DB = {
    A: { frets: ["x", "0", "2", "2", "2", "0"], baseFret: 1 },
    Am: { frets: ["x", "0", "2", "2", "1", "0"], baseFret: 1 },
    A7: { frets: ["x", "0", "2", "0", "2", "0"], baseFret: 1 },
    Am7: { frets: ["x", "0", "2", "0", "1", "0"], baseFret: 1 },
    Amaj7: { frets: ["x", "0", "2", "1", "2", "0"], baseFret: 1 },
    Asus2: { frets: ["x", "0", "2", "2", "0", "0"], baseFret: 1 },
    Asus4: { frets: ["x", "0", "2", "2", "3", "0"], baseFret: 1 },
    A6: { frets: ["x", "0", "2", "2", "2", "2"], baseFret: 1 },
    Adim: { frets: ["x", "0", "1", "2", "1", "2"], baseFret: 1 },
    B: { frets: ["x", "2", "4", "4", "4", "2"], baseFret: 1 },
    Bm: { frets: ["x", "2", "4", "4", "3", "2"], baseFret: 1 },
    B7: { frets: ["x", "2", "1", "2", "0", "2"], baseFret: 1 },
    Bm7: { frets: ["x", "2", "0", "2", "0", "2"], baseFret: 1 },
    Bb: { frets: ["x", "1", "3", "3", "3", "1"], baseFret: 1 },
    Bbm: { frets: ["x", "1", "3", "3", "2", "1"], baseFret: 1 },
    Bb7: { frets: ["x", "1", "3", "1", "3", "1"], baseFret: 1 },
    Bbm7: { frets: ["x", "1", "3", "1", "2", "1"], baseFret: 1 },
    C: { frets: ["x", "3", "2", "0", "1", "0"], baseFret: 1 },
    Cm: { frets: ["x", "3", "5", "5", "4", "3"], baseFret: 1 },
    C7: { frets: ["x", "3", "2", "3", "1", "0"], baseFret: 1 },
    Cm7: { frets: ["x", "3", "5", "3", "4", "3"], baseFret: 1 },
    Cmaj7: { frets: ["x", "3", "2", "0", "0", "0"], baseFret: 1 },
    Csus4: { frets: ["x", "3", "3", "0", "1", "0"], baseFret: 1 },
    Csus2: { frets: ["x", "3", "0", "0", "1", "0"], baseFret: 1 },
    Cadd9: { frets: ["x", "3", "2", "0", "3", "0"], baseFret: 1 },
    Cdim: { frets: ["x", "3", "4", "5", "4", "3"], baseFret: 1 },
    D: { frets: ["x", "x", "0", "2", "3", "2"], baseFret: 1 },
    Dm: { frets: ["x", "x", "0", "2", "3", "1"], baseFret: 1 },
    D7: { frets: ["x", "x", "0", "2", "1", "2"], baseFret: 1 },
    Dm7: { frets: ["x", "x", "0", "2", "1", "1"], baseFret: 1 },
    Dmaj7: { frets: ["x", "x", "0", "2", "2", "2"], baseFret: 1 },
    Dsus4: { frets: ["x", "x", "0", "2", "3", "3"], baseFret: 1 },
    Dsus2: { frets: ["x", "x", "0", "2", "3", "0"], baseFret: 1 },
    Dadd9: { frets: ["x", "x", "0", "2", "3", "0"], baseFret: 1 },
    Ddim: { frets: ["x", "x", "0", "1", "0", "1"], baseFret: 1 },
    E: { frets: ["0", "2", "2", "1", "0", "0"], baseFret: 1 },
    Em: { frets: ["0", "2", "2", "0", "0", "0"], baseFret: 1 },
    E7: { frets: ["0", "2", "0", "1", "0", "0"], baseFret: 1 },
    Em7: { frets: ["0", "2", "0", "0", "0", "0"], baseFret: 1 },
    Emaj7: { frets: ["0", "2", "1", "1", "0", "0"], baseFret: 1 },
    Esus4: { frets: ["0", "2", "2", "2", "0", "0"], baseFret: 1 },
    Edim: { frets: ["0", "1", "2", "0", "2", "0"], baseFret: 1 },
    F: { frets: ["1", "3", "3", "2", "1", "1"], baseFret: 1 },
    Fm: { frets: ["1", "3", "3", "1", "1", "1"], baseFret: 1 },
    F7: { frets: ["1", "3", "1", "2", "1", "1"], baseFret: 1 },
    Fm7: { frets: ["1", "3", "1", "1", "1", "1"], baseFret: 1 },
    Fmaj7: { frets: ["1", "3", "3", "2", "1", "0"], baseFret: 1 },
    Fsus4: { frets: ["1", "3", "3", "3", "1", "1"], baseFret: 1 },
    Fdim: { frets: ["1", "2", "3", "1", "3", "1"], baseFret: 1 },
    G: { frets: ["3", "2", "0", "0", "0", "3"], baseFret: 1 },
    Gm: { frets: ["3", "5", "5", "3", "3", "3"], baseFret: 1 },
    G7: { frets: ["3", "2", "0", "0", "0", "1"], baseFret: 1 },
    Gm7: { frets: ["3", "5", "3", "3", "3", "3"], baseFret: 1 },
    Gmaj7: { frets: ["3", "2", "0", "0", "0", "2"], baseFret: 1 },
    Gsus4: { frets: ["3", "3", "0", "0", "1", "3"], baseFret: 1 },
    Gsus2: { frets: ["3", "0", "0", "0", "3", "3"], baseFret: 1 },
    G6: { frets: ["3", "2", "0", "0", "0", "0"], baseFret: 1 },
    Gdim: { frets: ["3", "4", "5", "3", "5", "3"], baseFret: 1 },
    "F#": { frets: ["2", "4", "4", "3", "2", "2"], baseFret: 1 },
    "F#m": { frets: ["2", "4", "4", "2", "2", "2"], baseFret: 1 },
    "F#7": { frets: ["2", "4", "2", "3", "2", "2"], baseFret: 1 },
    "F#m7": { frets: ["2", "4", "2", "2", "2", "2"], baseFret: 1 },
    "C#": { frets: ["x", "4", "6", "6", "6", "4"], baseFret: 1 },
    "C#m": { frets: ["x", "4", "6", "6", "5", "4"], baseFret: 1 },
    "D#": { frets: ["x", "6", "8", "8", "8", "6"], baseFret: 1 },
    "D#m": { frets: ["x", "6", "8", "8", "7", "6"], baseFret: 1 },
    "G#": { frets: ["4", "6", "6", "5", "4", "4"], baseFret: 1 },
    "G#m": { frets: ["4", "6", "6", "4", "4", "4"], baseFret: 1 },
    "A#": { frets: ["x", "1", "3", "3", "3", "1"], baseFret: 1 },
    "A#m": { frets: ["x", "1", "3", "3", "2", "1"], baseFret: 1 },
    Db: { frets: ["x", "4", "6", "6", "6", "4"], baseFret: 1 },
    Dbm: { frets: ["x", "4", "6", "6", "5", "4"], baseFret: 1 },
    Eb: { frets: ["x", "6", "8", "8", "8", "6"], baseFret: 1 },
    Ebm: { frets: ["x", "6", "8", "8", "7", "6"], baseFret: 1 },
    Gb: { frets: ["2", "4", "4", "3", "2", "2"], baseFret: 1 },
    Gbm: { frets: ["2", "4", "4", "2", "2", "2"], baseFret: 1 },
    Ab: { frets: ["4", "6", "6", "5", "4", "4"], baseFret: 1 },
    Abm: { frets: ["4", "6", "6", "4", "4", "4"], baseFret: 1 },
  };

  const ENHARMONIC = {
    Db: "C#",
    Dbm: "C#m",
    Eb: "D#",
    Ebm: "D#m",
    Gb: "F#",
    Gbm: "F#m",
    Ab: "G#",
    Abm: "G#m",
    Bb: "A#",
    Bbm: "A#m",
    Cb: "B",
    Cbm: "Bm",
    Fb: "E",
    Fbm: "Em",
  };

  function readStoredEnabled() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === null) return true;
      return stored === "true";
    } catch {
      return true;
    }
  }

  function normalizeChordName(name) {
    let s = String(name || "").trim();
    if (!s) return "";

    s = s.replace(/\([^)]*\)/g, "").trim();
    if (s.includes("/")) {
      s = s.split("/")[0].trim();
    }

    // Capitalize root letter (bm → Bm) while preserving # / b accidentals.
    s = s.replace(/^([a-g])/, (letter) => letter.toUpperCase());

    s = s.replace(/min/gi, "m");
    s = s.replace(/maj9/gi, "maj9");
    s = s.replace(/maj7/gi, "maj7");
    s = s.replace(/maj/gi, "");
    s = s.replace(/M9$/, "maj9");
    s = s.replace(/M7$/, "maj7");
    s = s.replace(/M$/, "");

    if (ENHARMONIC[s]) {
      s = ENHARMONIC[s];
    }

    return s;
  }

  function resolveShapeForRender(shape) {
    // Keep absolute frets; only adjust baseFret so renderMiniSvg's
    // (fret - baseFret + 1) mapping fits the 4-fret window.
    const frets = (shape.frets || []).map(String);
    const fretted = frets
      .map((f) => parseInt(f, 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (fretted.length === 0) {
      return { frets, baseFret: 1 };
    }
    const minFret = Math.min(...fretted);
    const maxFret = Math.max(...fretted);
    if (maxFret <= 4) {
      return { frets, baseFret: 1 };
    }
    return { frets, baseFret: minFret };
  }

  function lookup(name) {
    const key = normalizeChordName(name);
    if (!key) return null;
    if (CHORD_DB[key]) return CHORD_DB[key];

    const fallbacks = [
      key.replace(/maj9$/, "maj7"),
      key.replace(/9$/, "7"),
      key.replace(/11$/, "7"),
      key.replace(/13$/, "7"),
      key.replace(/add9$/, ""),
      key.replace(/6$/, ""),
      key.replace(/aug$/, ""),
    ].filter(Boolean);

    for (const alt of fallbacks) {
      if (alt !== key && CHORD_DB[alt]) return CHORD_DB[alt];
    }

    return null;
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  }

  function renderMiniSvg(shape) {
    const { frets, baseFret = 1 } = shape;
    const fretCount = 4;
    const stringCount = 6;
    const padL = 5;
    const padT = 4;
    const padR = 2;
    const padB = 2;
    const gridW = 20;
    const gridH = 24;
    const w = padL + gridW + padR + (baseFret > 1 ? 6 : 0);
    const h = padT + gridH + padB;

    const svg = svgEl("svg", {
      class: "chord-diagram-svg",
      viewBox: `0 0 ${w} ${h}`,
      role: "img",
      "aria-hidden": "true",
    });

    const originX = padL + (baseFret > 1 ? 6 : 0);
    const originY = padT;
    const stringSpacing = gridW / (stringCount - 1);

    if (baseFret > 1) {
      const label = svgEl("text", {
        x: 4,
        y: originY + 6,
        "font-size": 5,
        fill: "currentColor",
        "text-anchor": "middle",
      });
      label.textContent = String(baseFret);
      svg.appendChild(label);
    } else {
      const nut = svgEl("line", {
        x1: originX,
        y1: originY,
        x2: originX + gridW,
        y2: originY,
        stroke: "currentColor",
        "stroke-width": 1.2,
      });
      svg.appendChild(nut);
    }

    for (let s = 0; s < stringCount; s++) {
      const x = originX + s * stringSpacing;
      svg.appendChild(
        svgEl("line", {
          x1: x,
          y1: originY,
          x2: x,
          y2: originY + gridH,
          stroke: "currentColor",
          "stroke-width": 0.5,
          opacity: 0.7,
        })
      );
    }

    const fretSpacing = gridH / fretCount;
    for (let f = 1; f <= fretCount; f++) {
      const y = originY + f * fretSpacing;
      svg.appendChild(
        svgEl("line", {
          x1: originX,
          y1: y,
          x2: originX + gridW,
          y2: y,
          stroke: "currentColor",
          "stroke-width": 0.5,
          opacity: 0.5,
        })
      );
    }

    for (let s = 0; s < stringCount; s++) {
      const fretVal = frets[s];
      const x = originX + s * stringSpacing;

      if (fretVal === "x" || fretVal === "X") {
        const cross = svgEl("text", {
          x,
          y: originY - 1,
          "font-size": 5,
          fill: "currentColor",
          "text-anchor": "middle",
        });
        cross.textContent = "×";
        svg.appendChild(cross);
      } else if (fretVal === "0") {
        svg.appendChild(
          svgEl("circle", {
            cx: x,
            cy: originY - 2,
            r: 1.4,
            fill: "none",
            stroke: "currentColor",
            "stroke-width": 0.6,
          })
        );
      } else {
        const fretNum = parseInt(fretVal, 10);
        if (!Number.isFinite(fretNum)) continue;
        const displayFret = fretNum - baseFret + 1;
        if (displayFret < 1 || displayFret > fretCount) continue;
        const y = originY + (displayFret - 0.5) * fretSpacing;
        svg.appendChild(
          svgEl("circle", {
            cx: x,
            cy: y,
            r: 1.8,
            fill: "currentColor",
          })
        );
      }
    }

  const barreFrets = frets.filter((f) => f !== "x" && f !== "0" && f !== "X");
    if (barreFrets.length >= 4) {
      const minFret = Math.min(...barreFrets.map((f) => parseInt(f, 10)));
      const barreStrings = frets
        .map((f, i) => (parseInt(f, 10) === minFret ? i : -1))
        .filter((i) => i >= 0);
      if (barreStrings.length >= 3) {
        const displayFret = minFret - baseFret + 1;
        if (displayFret >= 1 && displayFret <= fretCount) {
          const y = originY + (displayFret - 0.5) * fretSpacing;
          const x1 = originX + Math.min(...barreStrings) * stringSpacing;
          const x2 = originX + Math.max(...barreStrings) * stringSpacing;
          svg.appendChild(
            svgEl("line", {
              x1: x1,
              y1: y,
              x2: x2,
              y2: y,
              stroke: "currentColor",
              "stroke-width": 3.2,
              "stroke-linecap": "round",
              opacity: 0.85,
            })
          );
        }
      }
    }

    return svg;
  }

  function createMiniDiagram(name) {
    const shape = lookup(name);
    if (!shape) return null;

    const wrap = document.createElement("span");
    wrap.className = "chord-diagram";
    wrap.setAttribute("aria-hidden", "true");
    wrap.appendChild(renderMiniSvg(resolveShapeForRender(shape)));
    return wrap;
  }

  function isEnabled() {
    return enabled;
  }

  function setEnabled(value) {
    enabled = !!value;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    } catch {
      /* ignore */
    }
    const checkbox = document.getElementById("show-chord-diagrams");
    if (checkbox && checkbox.checked !== enabled) {
      checkbox.checked = enabled;
    }
  }

  function rerenderCurrentSong() {
    const song = window.currentDisplayedSong;
    const container = document.getElementById("song-content");
    if (
      !song ||
      !container ||
      !window.songRender ||
      typeof window.songRender.renderSongToContainer !== "function"
    ) {
      return;
    }
    window.songRender.renderSongToContainer(song, container);
    if (typeof window.applyTeleprompterZoom === "function") {
      window.applyTeleprompterZoom();
    }
    // Re-apply timeline transform to the new scroll plane after DOM rebuild.
    if (typeof window.reapplyTimelinePosition === "function") {
      window.reapplyTimelinePosition();
    }
  }

  function initToggle() {
    enabled = readStoredEnabled();
    const checkbox = document.getElementById("show-chord-diagrams");
    if (!checkbox) return;
    checkbox.checked = enabled;
    checkbox.addEventListener("change", () => {
      setEnabled(checkbox.checked);
      rerenderCurrentSong();
    });
  }

  enabled = readStoredEnabled();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initToggle);
  } else {
    initToggle();
  }

  window.chordDiagrams = {
    isEnabled,
    setEnabled,
    normalizeChordName,
    lookup,
    createMiniDiagram,
    rerenderCurrentSong,
  };
})();
