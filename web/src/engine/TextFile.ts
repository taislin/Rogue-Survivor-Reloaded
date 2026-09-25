/**
 * Text file loader - port of src/Engine/TextFile.cs
 *
 * C# synchronous `File.OpenText` → `fetch()` (async). Saving goes to
 * `localStorage` since the browser has no filesystem.
 */

export class TextFile {
  private m_RawLines: string[] = [];
  private m_FormatedLines: string[] | null = null;

  get rawLines(): readonly string[] {
    return this.m_RawLines;
  }

  get formatedLines(): string[] {
    return this.m_FormatedLines ?? [];
  }

  async load(fileName: string): Promise<boolean> {
    try {
      const response = await fetch(fileName);
      if (!response.ok) return false;
      const text = await response.text();
      this.m_RawLines = text.split(/\r\n|\r|\n/);
      // File.ReadAllText keeps a trailing empty line only when the file ends
      // with a newline; drop it so behaviour matches StreamReader.ReadLine.
      if (this.m_RawLines.length > 0 && this.m_RawLines[this.m_RawLines.length - 1] === "") {
        this.m_RawLines.pop();
      }
      this.m_FormatedLines = null;
      return true;
    } catch {
      return false;
    }
  }

  /** Browser equivalent of `File.WriteAllLines`: stores into localStorage. */
  save(fileName: string): boolean {
    try {
      localStorage.setItem(`textfile:${fileName}`, this.m_RawLines.join("\n"));
      return true;
    } catch {
      return false;
    }
  }

  // ── Raw editing ─────────────────────────────────────────────────────────
  append(line: string): void {
    this.m_RawLines.push(line);
  }

  // ── Parsing and formatting ──────────────────────────────────────────────
  formatLines(charsPerLine: number): void {
    if (!this.m_RawLines || this.m_RawLines.length === 0) return;

    this.m_FormatedLines = [];
    for (const rawLine of this.m_RawLines) {
      let line = rawLine;
      while (line.length > charsPerLine) {
        this.m_FormatedLines.push(line.substring(0, charsPerLine));
        line = line.substring(charsPerLine);
      }
      this.m_FormatedLines.push(line);
    }
  }
}

