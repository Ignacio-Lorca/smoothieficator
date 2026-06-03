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
    line.style.whiteSpace = "pre";

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
      line.appendChild(chordSpan);
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

    const body = document.createElement("div");
    body.classList.add("song-body");

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sectionMatch = line.match(
        /^\[(Verse|Chorus|Bridge|Intro|Outro|Pre-Chorus|Interlude|Solo)(?:\s*\d+|\s+[^\]]*)*\]$/
      );

      if (sectionMatch) {
        const sectionDiv = document.createElement("div");
        sectionDiv.className = "section-title";
        sectionDiv.textContent = sectionMatch[1];
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

    container.appendChild(body);
  }

  function chordLineToRaw(lineEl) {
    let result = "";
    lineEl.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
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
