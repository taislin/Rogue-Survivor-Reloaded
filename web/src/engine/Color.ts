/**
 * Immutable RGBA color — mirrors System.Drawing.Color from the C# source.
 * Values are in [0, 255].
 */
export class Color {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;

  private constructor(r: number, g: number, b: number, a = 255) {
    this.r = r & 0xff;
    this.g = g & 0xff;
    this.b = b & 0xff;
    this.a = a & 0xff;
  }

  // ── Factories ──────────────────────────────────────────────────────────────

  static fromArgb(r: number, g: number, b: number, a = 255): Color {
    return new Color(r, g, b, a);
  }

  /** Convenience: same alpha channel as `base` but new RGB. */
  static withAlpha(alpha: number, base: Color): Color {
    return new Color(base.r, base.g, base.b, alpha);
  }

  // ── Canvas helpers ────────────────────────────────────────────────────────

  /** `rgba(r, g, b, a_0_1)` string for use in Canvas 2D contexts. */
  toCssRgba(): string {
    return `rgba(${this.r},${this.g},${this.b},${(this.a / 255).toFixed(4)})`;
  }

  /** Blends this color with `other` using a gray-level dimming factor (0-1). */
  dimmed(factor: number): Color {
    return new Color(
      Math.round(this.r * factor),
      Math.round(this.g * factor),
      Math.round(this.b * factor),
      this.a,
    );
  }

  // ── Named colors (subset used by the game) ────────────────────────────────

  static readonly Black          = new Color(0, 0, 0);
  static readonly White          = new Color(255, 255, 255);
  static readonly Gray           = new Color(128, 128, 128);
  static readonly DarkGray       = new Color(64, 64, 64);
  static readonly LightGray      = new Color(211, 211, 211);
  static readonly DimGray        = new Color(105, 105, 105);
  static readonly LightCyan      = new Color(224, 255, 255);
  static readonly LightYellow    = new Color(255, 255, 224);
  static readonly Red            = new Color(255, 0, 0);
  static readonly DarkRed        = new Color(139, 0, 0);
  static readonly Green          = new Color(0, 128, 0);
  static readonly LightGreen     = new Color(144, 238, 144);
  static readonly DarkGreen      = new Color(0, 100, 0);
  static readonly Blue           = new Color(0, 0, 255);
  static readonly DarkBlue       = new Color(0, 0, 139);
  static readonly Cyan           = new Color(0, 255, 255);
  static readonly DarkCyan       = new Color(0, 139, 139);
  static readonly Magenta        = new Color(255, 0, 255);
  static readonly Yellow         = new Color(255, 255, 0);
  static readonly Gold           = new Color(255, 215, 0);
  static readonly Orange         = new Color(255, 165, 0);
  static readonly Brown          = new Color(165, 42, 42);
  static readonly CornflowerBlue = new Color(100, 149, 237);
  static readonly CadetBlue      = new Color(95, 158, 160);
  static readonly Snow            = new Color(255, 250, 250);
  static readonly LightBlue      = new Color(173, 216, 230);
  static readonly Pink           = new Color(255, 192, 203);
  static readonly Purple        = new Color(128, 0, 128);
  static readonly Transparent    = new Color(0, 0, 0, 0);
  static readonly DarkOrange    = new Color(255, 140, 0);
  static readonly OrangeRed     = new Color(255, 69, 0);
  static readonly Chocolate     = new Color(210, 105, 30);
  static readonly Beige         = new Color(245, 245, 220);
  static readonly HotPink       = new Color(255, 105, 180);

  toString(): string {
    return `rgba(${this.r},${this.g},${this.b},${this.a})`;
  }
}
