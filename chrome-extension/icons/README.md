# Icons

Place PNG icons here:
- `icon-16.png` — 16×16
- `icon-48.png` — 48×48
- `icon-128.png` — 128×128

Any solid-color or branded PNG will work. Generate with:

```bash
# Using ImageMagick (brew install imagemagick)
for size in 16 48 128; do
  convert -size ${size}x${size} xc:#1a73e8 icon-${size}.png
done
```
