// Safe song rendering (escape user text; controlled markup only)
(function () {
  const SECTION_REGEX =
    /\[(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Interlude|Solo)(?:\s*\d+|\s+[^\]]*)*\]/g;
  const CHORD_TAG_REGEX = /\[ch\](.*?)\[\/ch\]/g;
  const LEGACY_SECTION_HTML = /<div class="section-title">[^<]+<\/div>/g;

  function escapeHtml(text) {
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function stripRawHtml(text) {
    return String(text ?? "").replace(/<[^>]*>/g, "");
  }

  function normalizeContent(content) {
    return stripRawHtml(content).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function appendChordLine(parent, lineText) {
    const line = document.createElement("div");
    line.className = "chord-line";

    const showDiagrams =
      window.chordDiagrams &&
      typeof window.chordDiagrams.isEnabled === "function" &&
      window.chordDiagrams.isEnabled();

    const chordRegex = /\[ch\](.*?)\[\/ch\]/g;
    let lastIndex = 0;
    let match;

    while ((match = chordRegex.exec(lineText)) !== null) {
      if (match.index > lastIndex) {
        line.appendChild(document.createTextNode(lineText.slice(lastIndex, match.index)));
      }
      const chordSpan = document.createElement("span");
      chordSpan.className = "chord";
      chordSpan.textContent = match[1];

      if (showDiagrams) {
        const block = document.createElement("span");
        block.className = "chord-block";
        block.appendChild(chordSpan);
        if (
          window.chordDiagrams &&
          typeof window.chordDiagrams.createMiniDiagram === "function"
        ) {
          const diagram = window.chordDiagrams.createMiniDiagram(match[1]);
          if (diagram) block.appendChild(diagram);
        }
        line.appendChild(block);
      } else {
        line.appendChild(chordSpan);
      }

      lastIndex = chordRegex.lastIndex;
    }

    if (lastIndex < lineText.length) {
      line.appendChild(document.createTextNode(lineText.slice(lastIndex)));
    }

    parent.appendChild(line);
  }

  function renderSongToContainer(song, container) {
    container.replaceChildren();

    const header = document.createElement("div");
    header.classList.add("song-header");

    const titleEl = document.createElement("h2");
    titleEl.textContent = song.title || "";
    header.appendChild(titleEl);

    const artistEl = document.createElement("h3");
    artistEl.textContent = `by ${song.artist || ""}`;
    header.appendChild(artistEl);

    container.appendChild(header);

    let content = normalizeContent(song.content);
    content = content.replace(LEGACY_SECTION_HTML, "");

    // Viewport clips; scroll plane is content-height and receives translateY.
    // (If the plane itself is flex-height-constrained, overflow is clipped and
    // translating only moves the empty box off-screen.)
    const scrollViewport = document.createElement("div");
    scrollViewport.classList.add("song-scroll-viewport");

    const scrollPlane = document.createElement("div");
    scrollPlane.classList.add("song-scroll-plane");

    const body = document.createElement("div");
    body.classList.add("song-body");

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionMatch = line.match(
        /^\[((?:Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Interlude|Solo)(?:\s*\d+|\s+[^\]]*)*)\]$/
      );

      if (sectionMatch) {
        const sectionDiv = document.createElement("div");
        sectionDiv.className = "section-title";
        sectionDiv.textContent = sectionMatch[1].trim();
        body.appendChild(sectionDiv);
        continue;
      }

      if (/\[ch\].*\[\/ch\]/.test(line)) {
        appendChordLine(body, line);
      } else if (line.trim() === "") {
        const spacer = document.createElement("div");
        spacer.className = "spacer";
        body.appendChild(spacer);
      } else {
        const lyric = document.createElement("div");
        lyric.className = "lyric-line";
        lyric.textContent = line;
        body.appendChild(lyric);
      }
    }

    scrollPlane.appendChild(body);

    // Lead-in space so last lyrics can scroll up; SONG END sits at the true end
    // and maxTimelinePosition keeps it from leaving the viewport.
    const endLeadIn = document.createElement("div");
    endLeadIn.className = "song-end-lead-in";
    endLeadIn.setAttribute("aria-hidden", "true");
    scrollPlane.appendChild(endLeadIn);

    const endMarker = document.createElement("button");
    endMarker.type = "button";
    endMarker.className = "song-end-marker";
    endMarker.setAttribute("aria-label", "Song end — go to next song");
    endMarker.title = "Next song →";
    const endLabel = document.createElement("span");
    endLabel.className = "song-end-label";
    endLabel.textContent = "SONG END";
    const endHint = document.createElement("span");
    endHint.className = "song-end-hint";
    endHint.textContent = "Next song →";
    endMarker.appendChild(endLabel);
    endMarker.appendChild(endHint);
    endMarker.addEventListener("click", () => {
      if (typeof window.goToNextSong === "function") {
        window.goToNextSong();
      }
    });
    scrollPlane.appendChild(endMarker);

    scrollViewport.appendChild(scrollPlane);
    container.appendChild(scrollViewport);
  }

  function chordLineToRaw(lineEl) {
    let result = "";
    lineEl.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.classList &&
        node.classList.contains("chord-block")
      ) {
        const chordEl = node.querySelector(".chord");
        if (chordEl) {
          result += `[ch]${chordEl.textContent}[/ch]`;
        }
      } else if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.classList &&
        node.classList.contains("chord")
      ) {
        result += `[ch]${node.textContent}[/ch]`;
      } else if (node.textContent) {
        result += node.textContent;
      }
    });
    return result;
  }

  function extractRawContentFromDom(songBody) {
    let rawContent = "";
    const lines = songBody.querySelectorAll("div");
    lines.forEach((line) => {
      if (line.classList.contains("section-title")) {
        rawContent += `[${line.textContent.trim()}]\n`;
      } else if (line.classList.contains("chord-line")) {
        rawContent += `${chordLineToRaw(line)}\n`;
      } else if (line.classList.contains("lyric-line")) {
        rawContent += `${line.textContent}\n`;
      } else if (line.classList.contains("spacer")) {
        rawContent += "\n";
      }
    });
    return rawContent.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  window.songRender = {
    escapeHtml,
    renderSongToContainer,
    extractRawContentFromDom,
  };
})();
