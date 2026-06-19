# Noto Sans Symbols 2 (subset)

`NotoSansSymbols2-onsen.subset.ttf` is a subset of **Noto Sans Symbols 2**
(Google / The Noto Project) containing only the glyph for U+2668 HOT SPRINGS (♨).

Used at build time by [`scripts/render-onsen-icon.py`](../../render-onsen-icon.py)
to rasterize the Onsens tab icon. Not bundled into the app — only the resulting
PNG templates ship.

- Source: https://github.com/google/fonts/tree/main/ofl/notosanssymbols2
- License: SIL Open Font License 1.1 — see [`OFL.txt`](./OFL.txt).

To regenerate the subset from the full font:

```sh
python3 -m fontTools.subset NotoSansSymbols2-Regular.ttf \
  --unicodes=U+2668 --output-file=NotoSansSymbols2-onsen.subset.ttf \
  --no-hinting --desubroutinize
```
