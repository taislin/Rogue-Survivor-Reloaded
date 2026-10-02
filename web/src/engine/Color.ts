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
  static readonly Crimson        = new Color(220, 20, 60);
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
  // The four named colours Still Alive's intoxication scale uses (Release 7-1).
  // .NET's values: Tomato is 255,99,71; DarkSalmon 233,150,122;
  // MediumAquamarine 102,205,170; PaleGreen 152,251,152.
  static readonly Tomato             = new Color(255, 99, 71);
  static readonly DarkSalmon         = new Color(233, 150, 122);
  static readonly MediumAquamarine   = new Color(102, 205, 170);
  static readonly PaleGreen          = new Color(152, 251, 152);
  /**
   * `System.Drawing.Color.BurlyWood` (#DEB887), which the C# uses for the
   * `LIT_BROWN` floor colour in GameTiles. The port previously used `Brown`
   * instead, which is a saturated red rather than a pale tan. Added because the
   * constant was genuinely absent, not misnamed.
   *
   * Note `DarkGray` above is *not* the .NET `DarkGray` (169,169,169); the port's
   * (64,64,64) predates this file's conversion and is used as a UI line colour
   * throughout. Only `DimGray` and this one are faithful to .NET.
   */
  static readonly BurlyWood     = new Color(222, 184, 135);
  static readonly HotPink       = new Color(255, 105, 180);

  // ── Still Alive minimap palette ──
  //
  // Added for the 125 tile models ported from the fork by
  // scripts/port-tile-models.py. These are the .NET `System.Drawing` values,
  // which is what the C# names actually refer to, and which this file's
  // existing entries already follow -- CornflowerBlue (100,149,237),
  // CadetBlue (95,158,160), BurlyWood (222,184,135), Chocolate (210,105,30)
  // and LightBlue (173,216,230) are all .NET's, not approximations.
  //
  // The minimap is the only reader, so a wrong value here is invisible until a
  // district renders in a colour that is not quite the district's.
  static readonly SteelBlue       = new Color(70, 130, 180);
  static readonly Sienna          = new Color(160, 82, 45);
  static readonly SeaGreen        = new Color(46, 139, 87);
  static readonly OliveDrab       = new Color(107, 142, 35);
  static readonly MediumPurple    = new Color(147, 112, 219);
  static readonly Khaki           = new Color(240, 230, 140);
  static readonly Cornsilk        = new Color(255, 248, 220);
  static readonly BlanchedAlmond  = new Color(255, 235, 205);

  toString(): string {
    return `rgba(${this.r},${this.g},${this.b},${this.a})`;
  }
}
